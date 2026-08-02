import { Module } from "@nestjs/common";
import { AppController } from "./app.controller.js";
import { SERVER_CONFIG, loadConfig } from "./config.js";
import { GameGateway } from "./game/game.gateway.js";
import { RoomService } from "./game/room.service.js";

@Module({
  controllers: [AppController],
  providers: [
    { provide: SERVER_CONFIG, useFactory: () => loadConfig() },
    RoomService,
    GameGateway,
  ],
})
export class AppModule {}
