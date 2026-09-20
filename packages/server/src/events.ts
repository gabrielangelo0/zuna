import type { EventDef, EventWave, MonsterKind } from "@zuna/shared";
import type { WorldRoom } from "./WorldRoom.ts";
import { listEvents } from "./worldRepository.ts";
import type { WorldSim } from "./worldSim.ts";

// Eventos do mundo. Nada aqui é fixo no código: as regras vêm da aba Eventos do painel
// (texto, duração, bônus e levas de monstros). EVENT_INTERVAL_MIN=0 desliga os automáticos.

const AUTO_EVENTS = Number(process.env.EVENT_INTERVAL_MIN ?? 20) > 0;

export class EventManager {
  private readonly room: WorldRoom;
  private defs: EventDef[] = [];
  private active: EventDef | null = null;
  private endsAt = 0;
  /** Próximo disparo automático de cada evento. */
  private readonly nextAutoAt = new Map<number, number>();
  /** Monstros das levas que ainda estão vivos. */
  private readonly waveMonsters = new Set<string>();
  private wavesPending = 0;
  /** Muda a cada evento, para ignorar levas agendadas de um evento anterior. */
  private run = 0;

  constructor(room: WorldRoom) {
    this.room = room;
  }

  /** (Re)lê os eventos do banco. O que está rodando continua rodando. */
  async load() {
    this.defs = await listEvents();
    const now = Date.now();
    for (const def of this.defs) {
      if (def.autoMinutes > 0 && !this.nextAutoAt.has(def.id)) {
        this.nextAutoAt.set(def.id, now + def.autoMinutes * 60_000);
      }
    }
    for (const id of [...this.nextAutoAt.keys()]) {
      if (!this.defs.some((def) => def.id === id)) this.nextAutoAt.delete(id);
    }
    if (this.active) this.active = this.defs.find((def) => def.slug === this.active?.slug) ?? this.active;
  }

  list(): EventDef[] {
    return this.defs;
  }

  get runningSlug(): string {
    return this.active?.slug ?? "";
  }

  get runningEndsAt(): number {
    return this.active ? this.endsAt : 0;
  }

  update(now: number) {
    if (this.active) {
      if (now >= this.endsAt) this.finish(false);
      return;
    }
    if (!AUTO_EVENTS || this.room.clients.length === 0) {
      // Sem ninguém jogando, os relógios dos eventos automáticos ficam parados.
      for (const [id, at] of this.nextAutoAt) if (at <= now) this.nextAutoAt.set(id, now + 60_000);
      return;
    }

    for (const def of this.defs) {
      if (!def.enabled || def.autoMinutes <= 0) continue;
      const at = this.nextAutoAt.get(def.id) ?? now + def.autoMinutes * 60_000;
      if (now < at) continue;
      this.nextAutoAt.set(def.id, now + def.autoMinutes * 60_000);
      if (this.begin(def)) return;
    }
  }

  /** Começa um evento pela chave. Falso quando já existe um rodando ou a chave não existe. */
  start(slug: string): boolean {
    const def = this.defs.find((entry) => entry.slug === slug && entry.enabled);
    return def ? this.begin(def) : false;
  }

  /** Encerra na hora o evento em andamento. Falso quando não havia nenhum. */
  stop(): boolean {
    if (!this.active) return false;
    this.finish(false);
    return true;
  }

  /** Bônus de XP em vigor neste mundo. */
  xpMultiplierFor(sim: WorldSim): number {
    return this.appliesTo(sim) ? this.active!.xpMultiplier : 1;
  }

  /** Bônus de ouro em vigor neste mundo. */
  goldMultiplierFor(sim: WorldSim): number {
    return this.appliesTo(sim) ? this.active!.goldMultiplier : 1;
  }

  private appliesTo(sim: WorldSim): boolean {
    if (!this.active) return false;
    return this.active.worldId === 0 || this.active.worldId === sim.def.id;
  }

  private begin(def: EventDef): boolean {
    if (this.active) return false;
    this.active = def;
    this.endsAt = Date.now() + Math.max(1, def.minutes) * 60_000;
    this.room.state.eventName = def.name;
    this.room.state.eventEndsAt = this.endsAt;
    this.room.state.xpMultiplier = def.xpMultiplier;
    if (def.startText) this.room.announce(def.startText);

    const run = ++this.run;
    this.waveMonsters.clear();
    this.wavesPending = def.waves.length;
    for (const wave of def.waves) {
      this.room.after(Math.max(0, wave.delay) * 1000, () => this.spawnWave(run, wave));
    }
    return true;
  }

  /** Onde as levas nascem: o mundo do evento, ou o mundo padrão quando ele vale para todos. */
  private spawnWave(run: number, wave: EventWave) {
    if (!this.active || run !== this.run) return;
    const sim = this.room.eventWorld(this.active.worldId);
    if (!sim) return;

    for (let i = 0; i < wave.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.max(1, wave.radius) + Math.random() * 4;
      const at = {
        x: Math.round(sim.def.spawnX + Math.cos(angle) * radius),
        y: Math.round(sim.def.spawnY + Math.sin(angle) * radius),
      };
      const monster = this.room.spawnMonster(sim, wave.monster as MonsterKind, at, { respawns: false });
      if (!monster) continue;
      this.waveMonsters.add(monster.id);
      monster.onDeath = () => this.onWaveMonsterKilled(monster.id);
    }

    this.wavesPending = Math.max(0, this.wavesPending - 1);
    if (wave.text) this.room.announce(wave.text);
  }

  private onWaveMonsterKilled(id: string) {
    this.waveMonsters.delete(id);
    if (!this.active) return;
    if (this.active.endsWithWaves && this.wavesPending === 0 && this.waveMonsters.size === 0) this.finish(true);
  }

  private finish(victory: boolean) {
    const def = this.active;
    this.active = null;
    this.wavesPending = 0;
    if (!def) return;

    const survivors = [...this.waveMonsters];
    this.waveMonsters.clear();
    for (const id of survivors) this.room.removeMonster(id);

    const text = victory && def.winText ? def.winText : def.endText;
    if (text) this.room.announce(text);
    this.room.state.eventName = "";
    this.room.state.eventEndsAt = 0;
    this.room.state.xpMultiplier = 1;
  }
}
