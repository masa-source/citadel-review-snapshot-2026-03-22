import { connect } from "@dagger.io/dagger";

async function testConnection() {
  await connect(
    async (client) => {
      const postgresSvc = client
        .container()
        .from("postgres:15-alpine")
        .withEnvVariable("POSTGRES_USER", "citadel")
        .withEnvVariable("POSTGRES_PASSWORD", "citadel")
        .withEnvVariable("POSTGRES_DB", "citadel")
        .withExposedPort(5432)
        .asService();

      const tester = client
        .container()
        .from("alpine")
        .withServiceBinding("db", postgresSvc)
        .withExec(["apk", "add", "postgresql-client"])
        .withExec(["pg_isready", "-h", "db", "-p", "5432", "-U", "citadel"]);

      try {
        const result = await tester.stdout();
        console.log("✅ DB Connection Test Result:", result);
      } catch (err) {
        console.error("❌ DB Connection Test Failed:", err);
      }
    },
    { LogOutput: process.stdout }
  );
}

testConnection();
