import { Controller, Get, Inject } from "@nestjs/common";
import { SERVER_CONFIG, type ServerConfig } from "./config.js";
import { RoomService } from "./game/room.service.js";

/** Minimal HTTP surface: a health probe for Docker/E2E boot checks. */
@Controller()
export class AppController {
  constructor(
    @Inject(RoomService) private readonly rooms: RoomService,
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
  ) {}

  @Get("health")
  health(): {
    ok: true;
    service: string;
    rooms: number;
    turnTimeoutMs: number;
    autoPassLimit: number;
  } {
    return {
      ok: true,
      service: "janggi-arena-server",
      rooms: this.rooms.roomCount,
      turnTimeoutMs: this.config.turnTimeoutMs,
      autoPassLimit: this.config.autoPassLimit,
    };
  }
}
