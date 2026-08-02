"use client";

/**
 * 온라인 대국 세션 (P5) — 로비 · 방 · 소켓 수명 관리.
 *
 * 역할 분담:
 *   - `src/net/socket.ts`  전송 (소켓 하나, ack → promise)
 *   - 이 파일               세션 상태 (닉네임·방 코드·내 진영·시계 보정·배너)
 *   - `src/game/store.ts`  판 위의 상태 (스냅샷 → 화면, 연출 큐)
 *
 * 서버가 유일한 권위다. 여기서 하는 일은 (a) 의도를 보내고 (b) 브로드캐스트를
 * 게임 스토어에 넘기는 것뿐, 규칙 판정은 한 줄도 하지 않는다.
 */
import type { Side, Square } from "engine";
import { create } from "zustand";
import {
  errorMessage,
  type GameSnapshot,
  type PlayerInfo,
  type RoomInfo,
} from "@/src/net/protocol";
import * as net from "@/src/net/socket";
import { useGameStore } from "./store";

export type LobbyIntent = "create" | "join";

export type OnlinePhase =
  | "idle" // 로비 입력 중
  | "connecting" // 소켓 연결 / 방 생성·입장 대기
  | "waiting" // 방을 만들고 상대를 기다리는 중
  | "playing"
  | "finished";

const NICKNAME_KEY = "janggi.nickname.v1";
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 12;
export const ROOM_CODE_LENGTH = 6;
/** 서버와 동일한 문자셋 (0·O·1·I·L 제외) — 입력 필터에만 쓴다. */
const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function loadNickname(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(NICKNAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveNickname(nickname: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NICKNAME_KEY, nickname);
  } catch {
    /* private mode — 이번 세션에만 유지된다 */
  }
}

/** 대소문자·하이픈·공백을 서버 정규화 규칙과 같은 방식으로 다듬는다. */
export function normalizeRoomCode(raw: string): string {
  return [...raw.toUpperCase()]
    .filter((ch) => ROOM_CODE_ALPHABET.includes(ch))
    .join("")
    .slice(0, ROOM_CODE_LENGTH);
}

export function nicknameError(raw: string): string | null {
  const nickname = raw.trim();
  if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
    return `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 입력해 주세요.`;
  }
  return null;
}

export interface OnlineStore {
  intent: LobbyIntent;
  phase: OnlinePhase;
  /** 요청 왕복 중 — 버튼 중복 클릭 방지 */
  busy: boolean;
  nickname: string;
  codeInput: string;
  roomCode: string | null;
  mySide: Side | null;
  room: RoomInfo | null;
  /**
   * 가장 최근에 *도착한* 스냅샷. 게임 스토어의 것과 달리 연출 큐를 거치지
   * 않는다 — 턴 시계는 연출 중에도 실제 서버 시간을 따라야 하기 때문이다.
   */
  latest: GameSnapshot | null;
  /** serverTime − Date.now(). 남은 시간 = deadline − (now + offset) */
  clockOffset: number;
  /** 토스트 (연결 실패·비합법 수 등) */
  error: string | null;
  /** 배너 (상대 연결 끊김) */
  notice: string | null;
  resignAsking: boolean;

  hydrate: () => void;
  openLobby: (intent: LobbyIntent) => void;
  setIntent: (intent: LobbyIntent) => void;
  setNickname: (nickname: string) => void;
  setCodeInput: (code: string) => void;
  dismissError: () => void;
  dismissNotice: () => void;
  createRoom: () => Promise<void>;
  joinRoom: () => Promise<void>;
  /** 방 나가기 — 대국 중이면 서버가 기권으로 처리한다 (PROTOCOL 3절) */
  leave: () => Promise<void>;
  askResign: (open: boolean) => void;
  resign: () => Promise<void>;
}

const IDLE_SESSION = {
  phase: "idle" as OnlinePhase,
  busy: false,
  roomCode: null,
  mySide: null,
  room: null,
  latest: null,
  clockOffset: 0,
  notice: null,
  resignAsking: false,
};

export const useOnlineStore = create<OnlineStore>((set, get) => {
  /** 게임 스토어가 보드 입력을 서버로 보낼 때 쓰는 통로. */
  const gameNet = {
    move: (from: Square, to: Square) => {
      void net.sendMove(from, to).then((ack) => {
        if (!ack.ok) set({ error: errorMessage(ack.error) });
      });
    },
    pass: () => {
      void net.sendPass().then((ack) => {
        if (!ack.ok) set({ error: errorMessage(ack.error) });
      });
    },
  };

  const absorb = (snapshot: GameSnapshot) => {
    set({ latest: snapshot, clockOffset: snapshot.serverTime - Date.now() });
    useGameStore.getState().applySnapshot(snapshot);
  };

  /** 대국 개시 — game:start 또는 "이미 시작된 방"에 입장한 ack로 들어온다. */
  const beginMatch = (
    side: Side,
    room: RoomInfo,
    snapshot: GameSnapshot,
  ) => {
    const already =
      get().phase === "playing" && useGameStore.getState().mode === "online";
    set({
      phase: "playing",
      busy: false,
      room,
      mySide: side,
      roomCode: room.code,
      latest: snapshot,
      clockOffset: snapshot.serverTime - Date.now(),
    });
    if (already) {
      useGameStore.getState().applySnapshot(snapshot);
      return;
    }
    useGameStore.getState().startOnlineMatch(side, snapshot, gameNet);
  };

  /** 세션 종료 — 소켓을 닫고 홈으로. */
  const teardown = (error: string | null) => {
    net.disconnect();
    set({ ...IDLE_SESSION, error });
    useGameStore.getState().goTitle();
  };

  const handlers: net.ServerHandlers = {
    onRoomUpdate: ({ room }) => {
      const mySide = get().mySide;
      const opponent = room.players.find((p: PlayerInfo) => p.side !== mySide);
      set({
        room,
        notice:
          opponent && !opponent.connected
            ? `${opponent.nickname} 님의 연결이 끊겼습니다. 시계는 계속 흐릅니다.`
            : null,
      });
    },
    onGameStart: ({ room, snapshot }) => {
      const side = get().mySide;
      if (!side) return;
      beginMatch(side, room, snapshot);
    },
    onGameState: ({ snapshot }) => absorb(snapshot),
    onGameOver: ({ snapshot }) => {
      absorb(snapshot);
      set({ phase: "finished", resignAsking: false });
    },
    onOpponentDisconnected: ({ nickname }) => {
      set({
        notice: `${nickname} 님의 연결이 끊겼습니다. 시계는 계속 흐릅니다.`,
      });
    },
    onDisconnect: () => {
      const phase = get().phase;
      if (phase === "idle") return;
      teardown("서버와의 연결이 끊어졌습니다.");
    },
  };

  /** 소켓을 열고, 실패하면 홈으로 돌려보낸다 (CLAUDE.md 절대 규칙 7). */
  const ensureConnected = async (): Promise<boolean> => {
    try {
      await net.connect(handlers);
      return true;
    } catch {
      teardown(
        `온라인 서버(${net.serverUrl()})에 연결할 수 없습니다. 로컬 대국은 그대로 이용할 수 있습니다.`,
      );
      return false;
    }
  };

  return {
    intent: "create",
    nickname: "",
    codeInput: "",
    error: null,
    ...IDLE_SESSION,

    hydrate: () => set({ nickname: get().nickname || loadNickname() }),

    openLobby: (intent) => {
      set({ intent, error: null, ...IDLE_SESSION });
      useGameStore.getState().goLobby();
    },

    setIntent: (intent) => set({ intent, error: null }),
    setNickname: (nickname) => set({ nickname: nickname.slice(0, NICKNAME_MAX) }),
    setCodeInput: (code) => set({ codeInput: normalizeRoomCode(code) }),
    dismissError: () => set({ error: null }),
    dismissNotice: () => set({ notice: null }),

    createRoom: async () => {
      if (get().busy) return;
      const nickname = get().nickname.trim();
      const invalid = nicknameError(nickname);
      if (invalid) {
        set({ error: invalid });
        return;
      }
      set({ busy: true, error: null, phase: "connecting" });
      if (!(await ensureConnected())) return;

      const ack = await net.createRoom(nickname);
      if (!ack.ok) {
        set({ busy: false, phase: "idle", error: errorMessage(ack.error) });
        return;
      }
      saveNickname(nickname);
      set({
        busy: false,
        phase: "waiting",
        roomCode: ack.roomCode,
        mySide: ack.side,
        room: ack.room,
        latest: ack.snapshot,
        clockOffset: ack.snapshot.serverTime - Date.now(),
      });
    },

    joinRoom: async () => {
      if (get().busy) return;
      const nickname = get().nickname.trim();
      const invalid = nicknameError(nickname);
      if (invalid) {
        set({ error: invalid });
        return;
      }
      const code = normalizeRoomCode(get().codeInput);
      if (code.length !== ROOM_CODE_LENGTH) {
        set({ error: `방 코드는 ${ROOM_CODE_LENGTH}자리입니다.` });
        return;
      }
      set({ busy: true, error: null, phase: "connecting" });
      if (!(await ensureConnected())) return;

      const ack = await net.joinRoom(code, nickname);
      if (!ack.ok) {
        set({ busy: false, phase: "idle", error: errorMessage(ack.error) });
        return;
      }
      saveNickname(nickname);
      set({
        busy: false,
        roomCode: ack.roomCode,
        mySide: ack.side,
        room: ack.room,
        latest: ack.snapshot,
        clockOffset: ack.snapshot.serverTime - Date.now(),
      });
      // 두 번째 플레이어가 앉는 순간 서버가 game:start를 브로드캐스트한다.
      // 그 이벤트가 ack보다 먼저 도착할 수도 있으므로 여기서도 한 번 연다.
      if (ack.room.status === "playing") {
        beginMatch(ack.side, ack.room, ack.snapshot);
      } else {
        set({ phase: "waiting" });
      }
    },

    leave: async () => {
      if (net.getSocket()) await net.leaveRoom();
      net.disconnect();
      set({ ...IDLE_SESSION, error: null });
      useGameStore.getState().goTitle();
    },

    askResign: (open) => set({ resignAsking: open }),

    resign: async () => {
      set({ resignAsking: false });
      const ack = await net.sendResign();
      if (!ack.ok) set({ error: errorMessage(ack.error) });
    },
  };
});

/** 남은 시간(ms) — 서버·클라이언트 시계 차이를 offset으로 지운다. */
export function remainingMs(
  snapshot: GameSnapshot | null,
  clockOffset: number,
  now: number = Date.now(),
): number | null {
  if (!snapshot?.turnDeadline || snapshot.status !== "playing") return null;
  return Math.max(0, snapshot.turnDeadline - (now + clockOffset));
}

/** mm:ss */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
