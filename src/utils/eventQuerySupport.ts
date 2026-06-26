/** Skip events whose authorId no longer exists (avoids Prisma include errors). */
export const eventWithValidAuthorWhere = {
  author: { is: {} },
} as const;
