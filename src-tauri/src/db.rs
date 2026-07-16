use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
        version: 1,
        description: "create core tables",
        sql: r#"
            CREATE TABLE conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT 'New chat',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                provider_used TEXT,
                model_used TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX idx_messages_conversation ON messages(conversation_id);

            CREATE TABLE providers (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                label TEXT NOT NULL,
                model TEXT NOT NULL,
                base_url_override TEXT,
                priority INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                secret_ref TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE provider_usage (
                provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
                date TEXT NOT NULL,
                request_count INTEGER NOT NULL DEFAULT 0,
                token_count_estimate INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (provider_id, date)
            );
        "#,
        kind: MigrationKind::Up,
    },
        Migration {
            version: 2,
            description: "create mcp_servers table",
            sql: r#"
                CREATE TABLE mcp_servers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    command TEXT NOT NULL,
                    args_json TEXT NOT NULL,
                    scoped_path TEXT,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at INTEGER NOT NULL
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "mcp marketplace: catalog cache + remote/env support on mcp_servers",
            sql: r#"
                CREATE TABLE mcp_catalog_cache (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    version TEXT,
                    repository_url TEXT,
                    runtime TEXT NOT NULL,
                    install_json TEXT NOT NULL,
                    required_env_json TEXT NOT NULL,
                    fetched_at INTEGER NOT NULL
                );

                ALTER TABLE mcp_servers ADD COLUMN transport TEXT NOT NULL DEFAULT 'stdio';
                ALTER TABLE mcp_servers ADD COLUMN url TEXT;
                ALTER TABLE mcp_servers ADD COLUMN env_refs_json TEXT NOT NULL DEFAULT '{}';
                ALTER TABLE mcp_servers ADD COLUMN trust_tier TEXT NOT NULL DEFAULT 'community';
            "#,
            kind: MigrationKind::Up,
        },
    ]
}
