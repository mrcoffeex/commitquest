import { PrismaClient } from "@prisma/client";
import { ALL_QUESTS, BOSSES, SHOP_ITEMS, emptyStats } from "@commitquest/shared";

const prisma = new PrismaClient();

async function main() {
  const demo = await prisma.user.upsert({
    where: { githubId: "mock:octocat" },
    update: {},
    create: {
      githubId: "mock:octocat",
      githubLogin: "octocat",
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "https://github.com/octocat.png",
      character: {
        create: {
          displayName: "octocat",
          color: "#33ff88",
          stats: emptyStats(),
          cosmetics: [],
          emotes: ["gg", "duck", "404"],
          languageAffinity: { TypeScript: 2 },
        },
      },
    },
    include: { character: true },
  });

  console.log("Seeded demo user:", demo.login, demo.character?.id);
  console.log(
    `Catalog: ${ALL_QUESTS.length} quests, ${SHOP_ITEMS.length} shop items, ${BOSSES.length} bosses`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
