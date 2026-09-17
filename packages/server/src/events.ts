import { TEMPLE_X, TEMPLE_Y, TOWN_RADIUS, type MonsterKind } from "@game/shared";
import type { WorldRoom } from "./WorldRoom.ts";

const intervalMinutes = Number(process.env.EVENT_INTERVAL_MIN ?? 20);
/** Intervalo entre eventos automáticos. EVENT_INTERVAL_MIN=0 desliga. */
const AUTO_EVENT_INTERVAL_MS = intervalMinutes > 0 ? intervalMinutes * 60_000 : Infinity;
const DOUBLE_XP_MS = 10 * 60_000;
const INVASION_TIMEOUT_MS = 8 * 60_000;

type ActiveEvent = "doubleXp" | "invasion";

/** Eventos do mundo: XP em Dobro e Invasão Orc. Disparam sozinhos de tempos em tempos ou por comando. */
export class EventManager {
  private readonly room: WorldRoom;
  private active: ActiveEvent | null = null;
  private endsAt = 0;
  private nextAutoAt: number;
  private readonly invaders = new Set<string>();
  private wavesPending = 0;
  /** Muda a cada evento, para ignorar ondas agendadas de um evento anterior. */
  private run = 0;

  constructor(room: WorldRoom) {
    this.room = room;
    this.nextAutoAt = Date.now() + AUTO_EVENT_INTERVAL_MS;
  }

  update(now: number) {
    if (this.active) {
      if (now >= this.endsAt) this.finish(false);
      return;
    }
    if (now < this.nextAutoAt) return;
    if (this.room.clients.length === 0) {
      this.nextAutoAt = now + AUTO_EVENT_INTERVAL_MS;
      return;
    }
    if (Math.random() < 0.5) this.startDoubleXp();
    else this.startInvasion();
  }

  startDoubleXp(): boolean {
    if (this.active) return false;
    this.begin("doubleXp", "XP em Dobro", DOUBLE_XP_MS);
    this.room.state.xpMultiplier = 2;
    this.room.announce("Evento: XP em Dobro por 10 minutos! Todo monstro dá o dobro de experiência.");
    return true;
  }

  startInvasion(): boolean {
    if (this.active) return false;
    const run = this.begin("invasion", "Invasão Orc", INVASION_TIMEOUT_MS);
    this.wavesPending = 2;
    this.room.announce("Tambores de guerra ecoam... Uma horda de orcs se aproxima da cidade!");
    this.room.after(8_000, () => this.spawnWave(run, 10, false));
    this.room.after(45_000, () => this.spawnWave(run, 6, true));
    return true;
  }

  private begin(kind: ActiveEvent, name: string, durationMs: number): number {
    this.active = kind;
    this.endsAt = Date.now() + durationMs;
    this.room.state.eventName = name;
    this.room.state.eventEndsAt = this.endsAt;
    return ++this.run;
  }

  private spawnWave(run: number, orcs: number, withLeader: boolean) {
    if (this.active !== "invasion" || run !== this.run) return;
    const kinds: MonsterKind[] = Array.from({ length: orcs }, () => "orc");
    if (withLeader) kinds.push("orcLeader");

    for (const kind of kinds) {
      const angle = Math.random() * Math.PI * 2;
      const radius = TOWN_RADIUS + 3 + Math.random() * 5;
      const at = {
        x: Math.round(TEMPLE_X + Math.cos(angle) * radius),
        y: Math.round(TEMPLE_Y + Math.sin(angle) * radius),
      };
      const monster = this.room.spawnMonster(kind, at, false);
      if (!monster) continue;
      this.invaders.add(monster.id);
      monster.onDeath = () => this.onInvaderKilled(monster.id);
    }

    this.wavesPending--;
    this.room.announce(
      withLeader ? "O Senhor Esqueleto chegou! Derrote-o para salvar a cidade." : "Os orcs cercam a cidade! Saia e lute!",
    );
  }

  private onInvaderKilled(id: string) {
    this.invaders.delete(id);
    if (this.active === "invasion" && this.wavesPending === 0 && this.invaders.size === 0) this.finish(true);
  }

  private finish(victory: boolean) {
    if (this.active === "doubleXp") {
      this.room.state.xpMultiplier = 1;
      this.room.announce("O evento XP em Dobro terminou.");
    } else if (this.active === "invasion") {
      const survivors = [...this.invaders];
      this.invaders.clear();
      for (const id of survivors) this.room.removeMonster(id);
      this.room.announce(victory ? "A invasão foi derrotada! A cidade está a salvo." : "Os orcs recuaram para as montanhas.");
    }
    this.active = null;
    this.wavesPending = 0;
    this.room.state.eventName = "";
    this.room.state.eventEndsAt = 0;
    this.nextAutoAt = Date.now() + AUTO_EVENT_INTERVAL_MS;
  }
}
