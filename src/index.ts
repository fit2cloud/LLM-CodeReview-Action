import { run } from "probot";
import { robot } from "./bot.js";
import { Agent, setGlobalDispatcher } from 'undici';

setGlobalDispatcher(new Agent({
  connect: { timeout: 600_000 },
  headersTimeout: 600_000,
  bodyTimeout: 600_000,
}));

run(robot)
