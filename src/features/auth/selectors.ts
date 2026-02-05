import type { User } from "../../types";

export const getUserById = (users: User[], userId: string | null) =>
  users.find((user) => user.id === userId);
