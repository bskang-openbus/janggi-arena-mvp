# PROTOCOL.md — 온라인 대국 서버 이벤트 명세 (apps/server, P5)

- 대상: 웹 클라이언트(apps/web) 통합 담당. **이 문서만 보고 붙일 수 있게** 작성했다.
- 소스 오브 트루스: `apps/server/src/protocol.ts` (이벤트명·타입·에러코드 상수가 전부 export 되어 있다)
- 전송: socket.io v4, 기본 네임스페이스 `/`, 방은 socket.io room `room:<CODE>`
- 원칙: **서버 권위**. 클라이언트는 의도(`{from,to}` / pass / resign)만 보내고, 규칙 판정·시계·결과는 전부 서버가 계산해 스냅샷으로 내려준다. 클라이언트는 받은 스냅샷을 그리기만 하면 된다.

---

## 1. 연결

```ts
import { io } from "socket.io-client";
const socket = io(process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001", {
  transports: ["websocket"],
});
```

- 서버 포트: 환경변수 `PORT` (기본 3001 = 웹 3002 − 1). 호스트 `HOST` (기본 `0.0.0.0`)
- CORS: `CORS_ORIGIN` 미설정 시 모든 오리진 허용(개발 기본값). 콤마 구분 화이트리스트 지정 가능
- 헬스체크: `GET /health` → `{ ok: true, service, rooms, turnTimeoutMs, autoPassLimit }`
- 인증 없음. **소켓 하나 = 플레이어 하나**(`playerId === socket.id`). 재접속 복구는 범위 외(PRD 3절 제외 목록)이므로 소켓이 끊기면 그 자리는 되돌릴 수 없다.

## 2. 좌표계·기물 타입

`packages/engine`(docs/ENGINE_API.md)과 100% 동일하다. 변환 코드가 필요 없다.

```ts
type Side = "cho" | "han";                     // 초(선수, 방장) / 한
interface Square { file: number; rank: number } // file 0..8 = a..i, rank 0..9 = 1..10
type Board = (Piece | null)[][];                // board[rank][file], rank 0 = 초 진영
interface Piece { side: Side; type: PieceType; id: string }
```

## 3. 클라이언트 → 서버 이벤트

전부 **ack 콜백**으로 응답한다. 응답 형태는 항상 다음 중 하나다.

```ts
type Ack<T> = ({ ok: true } & T) | { ok: false; error: { code: ErrorCode; message: string } };
```

| 이벤트 | payload | ack 성공 payload |
| --- | --- | --- |
| `room:create` | `{ nickname: string }` | `SeatedAck` |
| `room:join` | `{ roomCode: string; nickname: string }` | `SeatedAck` |
| `room:leave` | 없음 (`{}`) | `{}` |
| `room:sync` | 없음 (`{}`) | `{ room: RoomInfo; snapshot: GameSnapshot }` |
| `game:move` | `{ from: Square; to: Square }` | `{ snapshot: GameSnapshot }` |
| `game:pass` | 없음 (`{}`) | `{ snapshot: GameSnapshot }` |
| `game:resign` | 없음 (`{}`) | `{ snapshot: GameSnapshot }` |

```ts
interface SeatedAck {
  roomCode: string;   // 항상 대문자 6자리
  playerId: string;   // === socket.id
  side: Side;         // 방장 = "cho", 참가자 = "han"
  room: RoomInfo;
  snapshot: GameSnapshot;
}
```

사용 예:

```ts
socket.emit("room:create", { nickname }, (ack) => {
  if (!ack.ok) return showError(ack.error.code);
  setRoomCode(ack.roomCode);   // 화면에 방 코드 표시
  setMySide(ack.side);         // "cho"
});

socket.emit("game:move", { from, to }, (ack) => {
  if (!ack.ok && ack.error.code === "ILLEGAL_MOVE") revertSelection();
  // 성공 시 별도 처리 불필요: 같은 내용이 game:state 로도 도착한다
});
```

세부 규칙

- `nickname`: 클라이언트가 정한 게스트 닉네임. 서버는 공백 정리·제어문자 제거만 하고 1~16자만 허용(세션 매핑용, 저장 안 함)
- `roomCode`: 대소문자·공백·하이픈 허용(`ab-c d2` → `ABCD2` 로 정규화). 문자셋은 `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (0·O·1·I·L 제외)
- `room:leave`: **대국 중이면 기권으로 처리**한다(항복과 동일 결과). 대기 중이면 그냥 자리 반납
- 한 소켓은 동시에 한 방에만 앉을 수 있다(중복 시 `ALREADY_IN_ROOM`)

## 4. 서버 → 클라이언트 이벤트

방 전체(양측)에 브로드캐스트된다.

| 이벤트 | payload | 발생 시점 |
| --- | --- | --- |
| `room:update` | `{ room: RoomInfo }` | 입장/퇴장/연결 끊김으로 참가자 목록이 바뀔 때 |
| `game:start` | `{ room: RoomInfo; snapshot: GameSnapshot }` | 두 번째 플레이어가 입장해 대국이 시작될 때 |
| `game:state` | `{ snapshot: GameSnapshot }` | 수·패스·자동패스·항복 등 상태가 바뀔 때마다 |
| `game:over` | `{ snapshot: GameSnapshot; result: MatchResult }` | 대국 종료 시 (`game:state` 직후에 한 번 더 온다) |
| `opponent:disconnected` | `{ side: Side; nickname: string }` | 상대 소켓이 끊겼을 때 |

- `game:over` 는 항상 같은 내용의 `game:state` 뒤에 온다. 결과 오버레이는 `game:over` 로 띄우면 된다.
- 자기 자신이 보낸 수도 브로드캐스트로 다시 받는다(ack와 중복). **스냅샷을 진실로 삼고 그대로 렌더**하면 중복 문제 없음.

## 5. 스냅샷 타입

```ts
type RoomStatus = "waiting" | "playing" | "finished";

interface PlayerInfo {
  side: Side;
  nickname: string;
  connected: boolean;
  host: boolean;      // 방장(= 초)
}

interface RoomInfo {
  code: string;
  status: RoomStatus;
  players: PlayerInfo[];   // 초 → 한 순서
  turnTimeoutMs: number;
  autoPassLimit: number;
}

interface LastAction {
  side: Side;
  kind: "move" | "pass";
  from: Square | null;      // kind === "move" 일 때만
  to: Square | null;
  notation: string;         // "a4a5" 또는 "pass"
  captured: Piece | null;   // 포획 연출 트리거 (P3 CaptureFX 입력과 동일한 모양)
  check: boolean;           // 이 수 이후 상대가 장군인가
  auto: boolean;            // 시간 초과로 서버가 대신 둔 패스인가
}

interface GameSnapshot {
  roomCode: string;
  status: RoomStatus;
  board: Board;                       // 전체 판 (board[rank][file])
  turn: Side;                         // 지금 둘 차례
  ply: number;                        // 지금까지 적용된 액션 수
  check: boolean;                     // turn 측이 현재 장군인가
  result: MatchResult | null;         // null = 진행 중
  lastAction: LastAction | null;
  captured: { cho: Piece[]; han: Piece[] };  // captured[side] = 그 진영이 잃은 기물들
  autoPassCount: { cho: number; han: number };
  turnDeadline: number | null;        // epoch ms, 진행 중일 때만
  turnTimeoutMs: number;              // 기본 60000
  serverTime: number;                 // 스냅샷 생성 시각(epoch ms) — 시계 보정용
  players: PlayerInfo[];
}
```

남은 시간 표시는 `turnDeadline - serverTime` 을 기준 삼아 로컬에서 카운트다운하면 서버·클라이언트 시계 차이에 영향받지 않는다.

## 6. 대국 결과 (`MatchResult`)

```ts
type MatchResult =
  | { type: "checkmate"; winner: Side }                                  // 외통 (엔진 판정)
  | { type: "draw"; reason: "facing" | "repetition" }                    // 빅장 / 동일 국면 3회
  | { type: "resign"; winner: Side; loser: Side }                        // 항복 또는 대국 중 room:leave
  | { type: "timeout"; winner: Side; loser: Side }                       // 장군 상태에서 시간 초과
  | { type: "forfeit"; winner: Side; loser: Side; reason: "auto_pass_limit" }; // 자동 패스 2회 누적
```

## 7. 턴 타이머 규칙 (서버 결정 사항)

- 1수 제한 시간 **60초** (`TURN_TIMEOUT_MS`). 대국 시작·매 액션마다 리셋된다.
- 시간 초과 시
  - **장군이 아닌 경우**: 서버가 그 측 대신 **한수쉼(pass)** 을 둔다 → `game:state` 의 `lastAction.auto === true`, `autoPassCount[side]` 증가
  - **장군인 경우**: 장기 규칙상 장군 상태에서는 패스가 불가능하므로 대신 둘 수가 없다 → **즉시 패배** (`result.type === "timeout"`)
- 자동 패스가 한 측에 **2회 누적**(`AUTO_PASS_LIMIT`)되면 그 측 패배 (`result.type === "forfeit"`). 2회째 자동 패스는 판에 적용된 뒤 곧바로 패배 처리되며, 이 판정은 그 패스로 발생한 무승부보다 우선한다.
- 연결이 끊긴 플레이어의 시계도 계속 흐른다 → 방치하면 자동 패스 2회로 패배한다(=사실상 상대 승리).

## 8. 연결 끊김

- 상대에게 `opponent:disconnected` + `room:update`(해당 플레이어 `connected: false`)가 간다. 대국은 **중단되지 않는다**.
- **재접속 복구는 지원하지 않는다**(PRD 3절 제외). 같은 방 코드로 다시 `room:join` 하면 `ROOM_FULL` 이다.
- 방에 연결된 소켓이 0이 되면 방과 타이머가 즉시 폐기된다(코드 재사용 가능).

## 9. 에러 코드

| code | 의미 | 주로 발생하는 이벤트 |
| --- | --- | --- |
| `BAD_PAYLOAD` | payload 형식 오류(좌표 범위 밖 포함) | `game:move` |
| `INVALID_NICKNAME` | 빈 닉네임 / 16자 초과 / 문자열 아님 | `room:create`, `room:join` |
| `INVALID_ROOM_CODE` | 6자리 코드 형식이 아님 | `room:join` |
| `ROOM_NOT_FOUND` | 그런 방이 없음(또는 이미 폐기됨) | `room:join` |
| `ROOM_FULL` | 정원 2명이 찼거나 이미 시작된 방 | `room:join` |
| `ALREADY_IN_ROOM` | 이 소켓은 이미 다른 방에 앉아 있음 | `room:create`, `room:join` |
| `NOT_IN_ROOM` | 자리 없이 대국 이벤트를 보냄 | `game:*`, `room:sync` |
| `GAME_NOT_STARTED` | 상대 입장 전 | `game:*` |
| `GAME_FINISHED` | 이미 끝난 대국 | `game:*` |
| `NOT_YOUR_TURN` | 상대 차례 | `game:move`, `game:pass` |
| `ILLEGAL_MOVE` | 엔진이 거부한 수 | `game:move` |
| `ILLEGAL_PASS` | 장군 상태에서 한수쉼 시도 | `game:pass` |
| `INTERNAL_ERROR` | 그 외 예외 | 모두 |

## 10. 전형적인 흐름

```text
방장 A                         서버                          참가자 B
  |-- room:create {nickname} -->|
  |<-- ack {roomCode, side:cho} |
  |                             |<-- room:join {roomCode, nickname} --|
  |                             |--- ack {side: han} ---------------->|
  |<---------- game:start (room, snapshot) -------------------------->|
  |-- game:move {from,to} ----->|  (엔진 합법성 검증)
  |<-- ack {snapshot}           |
  |<---------- game:state (snapshot) -------------------------------->|
  |                             |<-- game:move (비합법) --------------|
  |                             |--- ack {ok:false, ILLEGAL_MOVE} --->|
  |         ...60초 초과 시 서버가 자동 pass → game:state (auto:true)  |
  |<---------- game:state + game:over (result) ---------------------->|
```

## 11. 서버 실행

```bash
pnpm -F server build     # engine dist 빌드 + tsc
pnpm -F server start     # node dist/main.js
pnpm -F server test      # vitest (단위 + socket.io 통합)
```

| 환경변수 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `3001` | HTTP/socket.io 포트 |
| `HOST` | `0.0.0.0` | 바인드 주소 |
| `TURN_TIMEOUT_MS` | `60000` | 1수 제한 시간 |
| `AUTO_PASS_LIMIT` | `2` | 자동 패스 누적 패배 기준 |
| `CORS_ORIGIN` | (전체 허용) | 콤마 구분 오리진 화이트리스트 |
