import { generateAccount } from "./utils";

export type GeneratedAccount = Awaited<ReturnType<typeof generateAccount>>;
