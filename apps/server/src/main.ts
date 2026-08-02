import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { AppModule } from "./app.module.js";
import { loadConfig } from "./config.js";

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableCors({ origin: config.corsOrigin, credentials: true });
  app.enableShutdownHooks();

  await app.listen(config.port, config.host);
  new Logger("Bootstrap").log(
    `Janggi Arena server listening on ${config.host}:${config.port} ` +
      `(turn ${config.turnTimeoutMs}ms, auto-pass limit ${config.autoPassLimit})`,
  );
}

void bootstrap();
