-- Google-only accounts have no password. (Hand-written: `migrate dev` can't replay this repo's history into a shadow DB.)
ALTER TABLE "KhabriUser" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "KhabriUser" ALTER COLUMN "salt" DROP NOT NULL;
