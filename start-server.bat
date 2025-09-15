@echo off
set DATABASE_URL=postgresql://neondb_owner:npg_KH2CYZVt8GrF@ep-wandering-morning-afvvs67s.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require
set NODE_ENV=development
node --inspect -r tsx/cli server/index.ts
pause
