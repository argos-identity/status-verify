// Jest setup file for database testing
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __PRISMA__: PrismaClient | undefined;
}

// 테스트는 모든 테이블을 TRUNCATE 한다. 운영/개발 DB 를 가리킨 채 실행되면
// 데이터가 전부 사라지므로, 이름이 _test 로 끝나는 DB 만 허용한다.
function resolveTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL(또는 DATABASE_URL)이 설정되지 않았습니다. ' +
        '예: TEST_DATABASE_URL="postgresql://argos:argos123@localhost:5432/sla_monitor_test"'
    );
  }

  const databaseName = new URL(url).pathname.replace(/^\//, '');

  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `테스트가 '${databaseName}' DB 를 가리키고 있어 실행을 중단합니다. ` +
        '테스트는 모든 테이블을 TRUNCATE 하므로 이름이 _test 로 끝나는 DB 에서만 실행할 수 있습니다. ' +
        'TEST_DATABASE_URL 을 설정하세요.'
    );
  }

  return url;
}

if (!global.__PRISMA__) {
  global.__PRISMA__ = new PrismaClient({
    datasources: { db: { url: resolveTestDatabaseUrl() } },
  });
}

export const prisma = global.__PRISMA__;

// 테이블 목록을 하드코딩하면 마이그레이션으로 이름이 바뀔 때 조용히 깨진다.
// (실제로 incidents -> incident 개명 후 전체 스위트가 실행 불가였다)
export async function truncateAllTables(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
  `;

  if (tables.length === 0) {
    return;
  }

  const quoted = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`);
}

beforeAll(async () => {
  await truncateAllTables();
});

afterEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await truncateAllTables();
  await prisma.$disconnect();
});
