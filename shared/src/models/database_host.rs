use crate::{
    models::{InsertQueryBuilder, UpdateQueryBuilder},
    prelude::*,
};
use garde::Validate;
use serde::{Deserialize, Serialize};
use sqlx::{Row, postgres::PgRow, prelude::Type};
use std::{
    collections::{BTreeMap, HashMap},
    hash::Hash,
    sync::{Arc, LazyLock},
};
use tokio::sync::Mutex;
use utoipa::ToSchema;

pub enum DatabaseTransaction<'a> {
    Mysql(sqlx::Transaction<'a, sqlx::MySql>),
    Postgres(
        sqlx::Transaction<'a, sqlx::Postgres>,
        Arc<sqlx::Pool<sqlx::Postgres>>,
    ),
}

#[derive(Clone)]
pub enum DatabasePool {
    Mysql(Arc<sqlx::Pool<sqlx::MySql>>),
    Postgres(Arc<sqlx::Pool<sqlx::Postgres>>),
}

type DatabasePoolValue = (std::time::Instant, DatabasePool);
static DATABASE_CLIENTS: LazyLock<Arc<Mutex<HashMap<uuid::Uuid, DatabasePoolValue>>>> =
    LazyLock::new(|| {
        let clients = Arc::new(Mutex::new(HashMap::<uuid::Uuid, DatabasePoolValue>::new()));

        tokio::spawn({
            let clients = Arc::clone(&clients);
            async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;

                    let mut clients = clients.lock().await;
                    clients.retain(|_, &mut (last_used, _)| {
                        last_used.elapsed() < std::time::Duration::from_secs(300)
                    });
                }
            }
        });

        clients
    });

#[derive(ToSchema, Serialize, Deserialize, Type, PartialEq, Eq, Hash, Clone, Copy)]
#[serde(rename_all = "lowercase")]
#[schema(rename_all = "lowercase")]
#[sqlx(type_name = "database_type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DatabaseType {
    Mysql,
    Postgres,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DatabaseHost {
    pub uuid: uuid::Uuid,

    pub name: compact_str::CompactString,
    pub r#type: DatabaseType,

    pub deployment_enabled: bool,
    pub maintenance_enabled: bool,

    pub public_host: Option<compact_str::CompactString>,
    pub host: compact_str::CompactString,
    pub public_port: Option<i32>,
    pub port: i32,

    pub username: compact_str::CompactString,
    pub password: Vec<u8>,

    pub created: chrono::NaiveDateTime,
}

impl BaseModel for DatabaseHost {
    const NAME: &'static str = "database_host";

    #[inline]
    fn columns(prefix: Option<&str>) -> BTreeMap<&'static str, compact_str::CompactString> {
        let prefix = prefix.unwrap_or_default();

        BTreeMap::from([
            (
                "database_hosts.uuid",
                compact_str::format_compact!("{prefix}uuid"),
            ),
            (
                "database_hosts.name",
                compact_str::format_compact!("{prefix}name"),
            ),
            (
                "database_hosts.type",
                compact_str::format_compact!("{prefix}type"),
            ),
            (
                "database_hosts.deployment_enabled",
                compact_str::format_compact!("{prefix}deployment_enabled"),
            ),
            (
                "database_hosts.maintenance_enabled",
                compact_str::format_compact!("{prefix}maintenance_enabled"),
            ),
            (
                "database_hosts.public_host",
                compact_str::format_compact!("{prefix}public_host"),
            ),
            (
                "database_hosts.host",
                compact_str::format_compact!("{prefix}host"),
            ),
            (
                "database_hosts.public_port",
                compact_str::format_compact!("{prefix}public_port"),
            ),
            (
                "database_hosts.port",
                compact_str::format_compact!("{prefix}port"),
            ),
            (
                "database_hosts.username",
                compact_str::format_compact!("{prefix}username"),
            ),
            (
                "database_hosts.password",
                compact_str::format_compact!("{prefix}password"),
            ),
            (
                "database_hosts.created",
                compact_str::format_compact!("{prefix}created"),
            ),
        ])
    }

    #[inline]
    fn map(prefix: Option<&str>, row: &PgRow) -> Result<Self, crate::database::DatabaseError> {
        let prefix = prefix.unwrap_or_default();

        Ok(Self {
            uuid: row.try_get(compact_str::format_compact!("{prefix}uuid").as_str())?,
            name: row.try_get(compact_str::format_compact!("{prefix}name").as_str())?,
            r#type: row.try_get(compact_str::format_compact!("{prefix}type").as_str())?,
            deployment_enabled: row
                .try_get(compact_str::format_compact!("{prefix}deployment_enabled").as_str())?,
            maintenance_enabled: row
                .try_get(compact_str::format_compact!("{prefix}maintenance_enabled").as_str())?,
            public_host: row
                .try_get(compact_str::format_compact!("{prefix}public_host").as_str())?,
            host: row.try_get(compact_str::format_compact!("{prefix}host").as_str())?,
            public_port: row
                .try_get(compact_str::format_compact!("{prefix}public_port").as_str())?,
            port: row.try_get(compact_str::format_compact!("{prefix}port").as_str())?,
            username: row.try_get(compact_str::format_compact!("{prefix}username").as_str())?,
            password: row.try_get(compact_str::format_compact!("{prefix}password").as_str())?,
            created: row.try_get(compact_str::format_compact!("{prefix}created").as_str())?,
        })
    }
}

impl DatabaseHost {
    pub async fn get_connection(
        &self,
        database: &crate::database::Database,
    ) -> Result<DatabasePool, crate::database::DatabaseError> {
        let mut clients = DATABASE_CLIENTS.lock().await;

        if let Some((last_used, pool)) = clients.get_mut(&self.uuid) {
            *last_used = std::time::Instant::now();

            return Ok(pool.clone());
        }

        drop(clients);

        let password = database.decrypt(self.password.clone()).await?;

        let pool = match self.r#type {
            DatabaseType::Mysql => {
                let options = sqlx::mysql::MySqlConnectOptions::new()
                    .host(&self.host)
                    .port(self.port as u16)
                    .username(&self.username)
                    .password(&password);

                let pool = sqlx::Pool::connect_with(options).await?;
                DatabasePool::Mysql(Arc::new(pool))
            }
            DatabaseType::Postgres => {
                let options = sqlx::postgres::PgConnectOptions::new()
                    .host(&self.host)
                    .port(self.port as u16)
                    .username(&self.username)
                    .password(&password)
                    .database("postgres");

                let pool = sqlx::Pool::connect_with(options).await?;
                DatabasePool::Postgres(Arc::new(pool))
            }
        };

        DATABASE_CLIENTS
            .lock()
            .await
            .insert(self.uuid, (std::time::Instant::now(), pool.clone()));
        Ok(pool)
    }

    pub async fn all_with_pagination(
        database: &crate::database::Database,
        page: i64,
        per_page: i64,
        search: Option<&str>,
    ) -> Result<super::Pagination<Self>, crate::database::DatabaseError> {
        let offset = (page - 1) * per_page;

        let rows = sqlx::query(&format!(
            r#"
            SELECT {}, COUNT(*) OVER() AS total_count
            FROM database_hosts
            WHERE ($1 IS NULL OR database_hosts.name ILIKE '%' || $1 || '%')
            ORDER BY database_hosts.created
            LIMIT $2 OFFSET $3
            "#,
            Self::columns_sql(None)
        ))
        .bind(search)
        .bind(per_page)
        .bind(offset)
        .fetch_all(database.read())
        .await?;

        Ok(super::Pagination {
            total: rows
                .first()
                .map_or(Ok(0), |row| row.try_get("total_count"))?,
            per_page,
            page,
            data: rows
                .into_iter()
                .map(|row| Self::map(None, &row))
                .try_collect_vec()?,
        })
    }

    pub async fn by_location_uuid_uuid(
        database: &crate::database::Database,
        location_uuid: uuid::Uuid,
        uuid: uuid::Uuid,
    ) -> Result<Option<Self>, crate::database::DatabaseError> {
        let row = sqlx::query(&format!(
            r#"
            SELECT {}
            FROM database_hosts
            JOIN location_database_hosts ON location_database_hosts.database_host_uuid = database_hosts.uuid AND location_database_hosts.location_uuid = $1
            WHERE database_hosts.uuid = $2
            "#,
            Self::columns_sql(None)
        ))
        .bind(location_uuid)
        .bind(uuid)
        .fetch_optional(database.read())
        .await?;

        row.try_map(|row| Self::map(None, &row))
    }

    #[inline]
    pub fn into_admin_api_object(self) -> AdminApiDatabaseHost {
        AdminApiDatabaseHost {
            uuid: self.uuid,
            name: self.name,
            r#type: self.r#type,
            deployment_enabled: self.deployment_enabled,
            maintenance_enabled: self.maintenance_enabled,
            public_host: self.public_host,
            host: self.host,
            public_port: self.public_port,
            port: self.port,
            username: self.username,
            created: self.created.and_utc(),
        }
    }

    #[inline]
    pub fn into_api_object(self) -> ApiDatabaseHost {
        ApiDatabaseHost {
            uuid: self.uuid,
            name: self.name,
            maintenance_enabled: self.maintenance_enabled,
            r#type: self.r#type,
            host: self.public_host.unwrap_or(self.host),
            port: self.public_port.unwrap_or(self.port),
        }
    }
}

#[async_trait::async_trait]
impl ByUuid for DatabaseHost {
    async fn by_uuid(
        database: &crate::database::Database,
        uuid: uuid::Uuid,
    ) -> Result<Self, crate::database::DatabaseError> {
        let row = sqlx::query(&format!(
            r#"
            SELECT {}
            FROM database_hosts
            WHERE database_hosts.uuid = $1
            "#,
            Self::columns_sql(None)
        ))
        .bind(uuid)
        .fetch_one(database.read())
        .await?;

        Self::map(None, &row)
    }
}

#[derive(ToSchema, Deserialize, Validate)]
pub struct CreateDatabaseHostOptions {
    #[garde(length(chars, min = 1, max = 255))]
    #[schema(min_length = 1, max_length = 255)]
    pub name: compact_str::CompactString,
    #[garde(skip)]
    pub r#type: DatabaseType,

    #[garde(skip)]
    pub deployment_enabled: bool,
    #[garde(skip)]
    pub maintenance_enabled: bool,

    #[garde(length(chars, min = 3, max = 255))]
    #[schema(min_length = 3, max_length = 255)]
    pub public_host: Option<compact_str::CompactString>,
    #[garde(length(chars, min = 3, max = 255))]
    #[schema(min_length = 3, max_length = 255)]
    pub host: compact_str::CompactString,
    #[garde(range(min = 1))]
    #[schema(minimum = 1)]
    pub public_port: Option<u16>,
    #[garde(range(min = 1))]
    #[schema(minimum = 1)]
    pub port: u16,

    #[garde(length(chars, min = 3, max = 255))]
    #[schema(min_length = 3, max_length = 255)]
    pub username: compact_str::CompactString,
    #[garde(length(chars, min = 1, max = 512))]
    #[schema(min_length = 1, max_length = 512)]
    pub password: compact_str::CompactString,
}

#[async_trait::async_trait]
impl CreatableModel for DatabaseHost {
    type CreateOptions<'a> = CreateDatabaseHostOptions;
    type CreateResult = Self;

    fn get_create_handlers() -> &'static LazyLock<CreateListenerList<Self>> {
        static CREATE_LISTENERS: LazyLock<CreateListenerList<DatabaseHost>> =
            LazyLock::new(|| Arc::new(ModelHandlerList::default()));

        &CREATE_LISTENERS
    }

    async fn create(
        state: &crate::State,
        mut options: Self::CreateOptions<'_>,
    ) -> Result<Self, crate::database::DatabaseError> {
        options.validate()?;

        let mut transaction = state.database.write().begin().await?;

        let mut query_builder = InsertQueryBuilder::new("database_hosts");

        Self::run_create_handlers(&mut options, &mut query_builder, state, &mut transaction)
            .await?;

        query_builder
            .set("name", &options.name)
            .set("type", options.r#type)
            .set("deployment_enabled", options.deployment_enabled)
            .set("maintenance_enabled", options.maintenance_enabled)
            .set("public_host", &options.public_host)
            .set("host", &options.host)
            .set("public_port", options.public_port.map(|p| p as i32))
            .set("port", options.port as i32)
            .set("username", &options.username)
            .set(
                "password",
                state.database.encrypt(options.password.to_string()).await?,
            );

        let row = query_builder
            .returning(&Self::columns_sql(None))
            .fetch_one(&mut *transaction)
            .await?;
        let database_host = Self::map(None, &row)?;

        transaction.commit().await?;

        Ok(database_host)
    }
}

#[derive(ToSchema, Serialize, Deserialize, Validate, Clone, Default)]
pub struct UpdateDatabaseHostOptions {
    #[garde(length(chars, min = 1, max = 255))]
    #[schema(min_length = 1, max_length = 255)]
    name: Option<compact_str::CompactString>,

    #[garde(skip)]
    deployment_enabled: Option<bool>,
    #[garde(skip)]
    maintenance_enabled: Option<bool>,

    #[garde(length(max = 255))]
    #[schema(max_length = 255)]
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "::serde_with::rust::double_option"
    )]
    public_host: Option<Option<compact_str::CompactString>>,
    #[garde(length(chars, min = 3, max = 255))]
    #[schema(min_length = 3, max_length = 255)]
    host: Option<compact_str::CompactString>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "::serde_with::rust::double_option"
    )]
    #[garde(range(min = 1))]
    #[schema(minimum = 1)]
    public_port: Option<Option<u16>>,
    #[garde(range(min = 1))]
    #[schema(minimum = 1)]
    port: Option<u16>,

    #[garde(length(chars, min = 3, max = 255))]
    #[schema(min_length = 3, max_length = 255)]
    username: Option<compact_str::CompactString>,
    #[garde(length(chars, min = 1, max = 512))]
    #[schema(min_length = 1, max_length = 512)]
    password: Option<compact_str::CompactString>,
}

#[async_trait::async_trait]
impl UpdatableModel for DatabaseHost {
    type UpdateOptions = UpdateDatabaseHostOptions;

    fn get_update_handlers() -> &'static LazyLock<UpdateListenerList<Self>> {
        static UPDATE_LISTENERS: LazyLock<UpdateListenerList<DatabaseHost>> =
            LazyLock::new(|| Arc::new(ModelHandlerList::default()));

        &UPDATE_LISTENERS
    }

    async fn update(
        &mut self,
        state: &crate::State,
        mut options: Self::UpdateOptions,
    ) -> Result<(), crate::database::DatabaseError> {
        options.validate()?;

        let mut transaction = state.database.write().begin().await?;

        let mut query_builder = UpdateQueryBuilder::new("database_hosts");

        Self::run_update_handlers(
            self,
            &mut options,
            &mut query_builder,
            state,
            &mut transaction,
        )
        .await?;

        let password = if let Some(password) = options.password {
            Some(state.database.encrypt(password.to_string()).await?)
        } else {
            None
        };

        query_builder
            .set("name", options.name.as_ref())
            .set("deployment_enabled", options.deployment_enabled)
            .set("maintenance_enabled", options.maintenance_enabled)
            .set("public_host", options.public_host.as_ref())
            .set("host", options.host.as_ref())
            .set(
                "public_port",
                options
                    .public_port
                    .as_ref()
                    .map(|p| p.as_ref().map(|port| *port as i32)),
            )
            .set("port", options.port.as_ref().map(|p| *p as i32))
            .set("username", options.username.as_ref())
            .set("password", password.as_ref())
            .where_eq("uuid", self.uuid);

        query_builder.execute(&mut *transaction).await?;

        if let Some(name) = options.name {
            self.name = name;
        }
        if let Some(deployment_enabled) = options.deployment_enabled {
            self.deployment_enabled = deployment_enabled;
        }
        if let Some(maintenance_enabled) = options.maintenance_enabled {
            self.maintenance_enabled = maintenance_enabled;
        }
        if let Some(public_host) = options.public_host {
            self.public_host = public_host;
        }
        if let Some(host) = options.host {
            self.host = host;
        }
        if let Some(public_port) = options.public_port {
            self.public_port = public_port.map(|port| port as i32);
        }
        if let Some(port) = options.port {
            self.port = port as i32;
        }
        if let Some(username) = options.username {
            self.username = username;
        }
        if let Some(password) = password {
            self.password = password;
        }

        transaction.commit().await?;

        Ok(())
    }
}

#[async_trait::async_trait]
impl DeletableModel for DatabaseHost {
    type DeleteOptions = ();

    fn get_delete_handlers() -> &'static LazyLock<DeleteListenerList<Self>> {
        static DELETE_LISTENERS: LazyLock<DeleteListenerList<DatabaseHost>> =
            LazyLock::new(|| Arc::new(ModelHandlerList::default()));

        &DELETE_LISTENERS
    }

    async fn delete(
        &self,
        state: &crate::State,
        options: Self::DeleteOptions,
    ) -> Result<(), anyhow::Error> {
        let mut transaction = state.database.write().begin().await?;

        self.run_delete_handlers(&options, state, &mut transaction)
            .await?;

        sqlx::query(
            r#"
            DELETE FROM database_hosts
            WHERE database_hosts.uuid = $1
            "#,
        )
        .bind(self.uuid)
        .execute(&mut *transaction)
        .await?;

        transaction.commit().await?;

        Ok(())
    }
}

#[derive(ToSchema, Serialize)]
#[schema(title = "AdminDatabaseHost")]
pub struct AdminApiDatabaseHost {
    pub uuid: uuid::Uuid,

    pub name: compact_str::CompactString,
    pub deployment_enabled: bool,
    pub maintenance_enabled: bool,
    pub r#type: DatabaseType,

    pub public_host: Option<compact_str::CompactString>,
    pub host: compact_str::CompactString,
    pub public_port: Option<i32>,
    pub port: i32,

    pub username: compact_str::CompactString,

    pub created: chrono::DateTime<chrono::Utc>,
}

#[derive(ToSchema, Serialize)]
#[schema(title = "DatabaseHost")]
pub struct ApiDatabaseHost {
    pub uuid: uuid::Uuid,

    pub name: compact_str::CompactString,
    pub maintenance_enabled: bool,
    pub r#type: DatabaseType,

    pub host: compact_str::CompactString,
    pub port: i32,
}
