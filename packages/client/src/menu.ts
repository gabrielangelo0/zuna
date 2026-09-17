import {
  CATALOG,
  HAIR_COLORS,
  OUTFIT_COLORS,
  SKIN_TONES,
  normalizeCharacterName,
  normalizeUsername,
  validateCharacterName,
  validatePassword,
  validateUsername,
  type Appearance,
  type AuthResponse,
  type CharacterSummary,
  type CharactersResponse,
  type CreateCharacterResponse,
} from "@zuna/shared";
import { ApiError, apiRequest, clearToken, loadToken, saveToken } from "./api.ts";
import { AppearanceEditor } from "./appearanceEditor.ts";
import { element, messageOf } from "./dom.ts";
import { LookPreview } from "./lookPreview.ts";

type Screen = "auth" | "characters" | "creator";
type AuthMode = "login" | "register";

const FREE_OUTFITS = CATALOG.filter((item) => item.kind === "outfit" && item.price === 0).map((item) => item.id);

const randomIndex = (length: number) => Math.floor(Math.random() * length);

function randomAppearance(): Appearance {
  return {
    skin: randomIndex(SKIN_TONES.length),
    hairColor: randomIndex(HAIR_COLORS.length),
    outfit: FREE_OUTFITS[randomIndex(FREE_OUTFITS.length)],
    primary: randomIndex(OUTFIT_COLORS.length),
    secondary: randomIndex(OUTFIT_COLORS.length),
    detail: randomIndex(OUTFIT_COLORS.length),
  };
}

/** Telas antes do jogo: login/cadastro, lista de personagens e criação de personagem. */
export class Menu {
  private readonly root = element("#menu");
  private readonly screens: Record<Screen, HTMLElement> = {
    auth: element("#screen-auth"),
    characters: element("#screen-characters"),
    creator: element("#screen-creator"),
  };
  private readonly error = element("#menu-error");
  private readonly authForm = element<HTMLFormElement>("#auth-form");
  private readonly username = element<HTMLInputElement>("#auth-username");
  private readonly password = element<HTMLInputElement>("#auth-password");
  private readonly authSubmit = element<HTMLButtonElement>("#auth-submit");
  private readonly authTabs = [...document.querySelectorAll<HTMLButtonElement>("[data-auth-mode]")];
  private readonly greeting = element("#characters-greeting");
  private readonly characterList = element("#character-list");
  private readonly newCharacterButton = element<HTMLButtonElement>("#character-new");
  private readonly creatorName = element<HTMLInputElement>("#creator-name");
  private readonly creatorCanvas = element<HTMLCanvasElement>("#creator-canvas");
  private readonly creatorCreate = element<HTMLButtonElement>("#creator-create");
  private readonly creatorPreview = new LookPreview(this.creatorCanvas, { dir: "SE", scale: 2.3, footY: 250, animate: true });
  private readonly editor: AppearanceEditor;
  private readonly onPlay: (token: string, characterId: number) => Promise<void>;
  private mode: AuthMode = "login";
  private token: string | null = null;

  constructor(onPlay: (token: string, characterId: number) => Promise<void>) {
    this.onPlay = onPlay;
    this.editor = new AppearanceEditor(element("#creator-editor"), randomAppearance(), {
      outfits: FREE_OUTFITS,
      onChange: () => this.paintCreator(),
    });

    for (const tab of this.authTabs) {
      tab.addEventListener("click", () => this.setMode(tab.dataset.authMode as AuthMode));
    }
    this.authForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submitAuth();
    });
    for (const input of [this.username, this.password]) {
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        this.authForm.requestSubmit();
      });
    }
    element("#logout").addEventListener("click", () => void this.logout());
    this.newCharacterButton.addEventListener("click", () => this.showCreator());
    element("#creator-back").addEventListener("click", () => void this.loadCharacters(false));
    this.creatorCreate.addEventListener("click", () => void this.createCharacter());
    this.creatorName.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void this.createCharacter();
    });
    element("#creator-random").addEventListener("click", () => {
      this.editor.set(randomAppearance());
      this.paintCreator();
    });
  }

  async start() {
    this.token = loadToken();
    if (this.token) await this.loadCharacters();
    else this.show("auth");
  }

  hide() {
    this.root.hidden = true;
  }

  private show(screen: Screen) {
    for (const [name, section] of Object.entries(this.screens)) section.hidden = name !== screen;
    this.root.classList.toggle("wide", screen === "creator");
    this.error.hidden = true;
    if (screen === "auth") this.username.focus();
    if (screen === "creator") {
      this.creatorName.focus();
      this.creatorPreview.start();
    }
  }

  private showError(message: string) {
    this.error.textContent = message;
    this.error.hidden = false;
  }

  private setMode(mode: AuthMode) {
    this.mode = mode;
    for (const tab of this.authTabs) tab.classList.toggle("active", tab.dataset.authMode === mode);
    this.authSubmit.textContent = mode === "login" ? "Entrar" : "Criar conta";
    this.password.autocomplete = mode === "login" ? "current-password" : "new-password";
    this.error.hidden = true;
  }

  private async submitAuth() {
    const username = normalizeUsername(this.username.value);
    const password = this.password.value;
    const problem = validateUsername(username) ?? validatePassword(password);
    if (problem) {
      this.showError(problem);
      return;
    }
    await this.busy(this.authSubmit, async () => {
      const response = await apiRequest<AuthResponse>(`/api/auth/${this.mode}`, {
        method: "POST",
        body: { username, password },
      });
      this.token = response.token;
      saveToken(response.token);
      this.password.value = "";
      await this.loadCharacters();
    });
  }

  /** Conta sem personagens vai direto para a criação, a não ser quando a pessoa acabou de voltar dela. */
  private async loadCharacters(openCreatorWhenEmpty = true) {
    if (!this.token) {
      this.show("auth");
      return;
    }
    try {
      const response = await apiRequest<CharactersResponse>("/api/characters", { token: this.token });
      this.renderCharacters(response);
      if (openCreatorWhenEmpty && response.characters.length === 0) this.showCreator();
      else this.show("characters");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await this.logout();
        this.showError("Sua sessão expirou. Entre novamente.");
        return;
      }
      this.show("auth");
      this.showError(messageOf(error));
    }
  }

  private renderCharacters(response: CharactersResponse) {
    this.greeting.textContent = `Olá, ${response.username}! Escolha seu personagem.`;
    if (response.characters.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "Você ainda não tem personagens.";
      this.characterList.replaceChildren(empty);
    } else {
      this.characterList.replaceChildren(...response.characters.map((character) => this.characterItem(character)));
    }
    this.newCharacterButton.hidden = response.characters.length >= response.maxCharacters;
  }

  private characterItem(character: CharacterSummary): HTMLElement {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "character";

    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 128;
    new LookPreview(canvas, { dir: "SE", scale: 1.15, footY: 108, animate: false }).set({ appearance: character.appearance });

    const info = document.createElement("span");
    info.className = "character-info";
    const name = document.createElement("strong");
    name.textContent = character.name;
    const level = document.createElement("small");
    level.textContent = `Nível ${character.level}`;
    info.append(name, level);

    const play = document.createElement("span");
    play.className = "play";
    play.textContent = "Jogar";

    button.append(canvas, info, play);
    button.addEventListener("click", () => void this.play(character.id, button));
    item.append(button);
    return item;
  }

  private showCreator() {
    this.creatorName.value = "";
    this.editor.set(randomAppearance());
    this.paintCreator();
    this.show("creator");
  }

  private paintCreator() {
    this.creatorPreview.set({ appearance: this.editor.value });
    this.creatorPreview.start();
  }

  private async createCharacter() {
    const token = this.token;
    if (!token) return;
    const name = normalizeCharacterName(this.creatorName.value);
    const problem = validateCharacterName(name);
    if (problem) {
      this.showError(problem);
      return;
    }
    await this.busy(this.creatorCreate, async () => {
      const response = await apiRequest<CreateCharacterResponse>("/api/characters", {
        method: "POST",
        token,
        body: { name, appearance: this.editor.value },
      });
      await this.onPlay(token, response.character.id);
    });
  }

  private async play(characterId: number, button: HTMLButtonElement) {
    const token = this.token;
    if (!token) return;
    await this.busy(button, () => this.onPlay(token, characterId));
  }

  private async logout() {
    const token = this.token;
    this.token = null;
    clearToken();
    this.show("auth");
    if (token) await apiRequest("/api/auth/logout", { method: "POST", token }).catch(() => undefined);
  }

  private async busy(button: HTMLButtonElement, task: () => Promise<void>) {
    button.disabled = true;
    this.error.hidden = true;
    try {
      await task();
    } catch (error) {
      // A sala responde 401 quando a sessão venceu entre abrir o menu e entrar no jogo.
      if ((error as { code?: number } | null)?.code === 401) {
        await this.logout();
      }
      this.showError(messageOf(error));
    } finally {
      button.disabled = false;
    }
  }
}
