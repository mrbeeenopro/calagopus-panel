use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod put {
    use axum::http::StatusCode;
    use compact_str::ToCompactString;
    use futures_util::TryStreamExt;
    use serde::Serialize;
    use shared::{
        GetState,
        models::user::GetPermissionManager,
        response::{ApiResponse, ApiResponseResult},
    };
    use utoipa::ToSchema;

    #[derive(ToSchema, Serialize)]
    struct Response {
        extension: shared::extensions::PendingExtension,
    }

    #[utoipa::path(put, path = "/", responses(
        (status = OK, body = inline(Response)),
    ))]
    pub async fn route(
        state: GetState,
        permissions: GetPermissionManager,
        body: axum::body::Body,
    ) -> ApiResponseResult {
        if !matches!(
            state.container_type,
            shared::AppContainerType::OfficialHeavy
        ) {
            return ApiResponse::error(
                "extension management is only available in the official heavy container",
            )
            .with_status(StatusCode::NOT_IMPLEMENTED)
            .ok();
        }

        permissions.has_admin_permission("extensions.manage")?;

        let distr = shared::heavy::write_extension(&mut tokio_util::io::StreamReader::new(
            body.into_data_stream().map_err(std::io::Error::other),
        ))
        .await?;

        ApiResponse::new_serialized(Response {
            extension: shared::extensions::PendingExtension {
                package_name: distr.metadata_toml.package_name.to_compact_string(),
                metadata_toml: distr.metadata_toml,
                description: distr.cargo_toml.package.description.into(),
                authors: distr
                    .cargo_toml
                    .package
                    .authors
                    .into_iter()
                    .map(|a| a.into())
                    .collect(),
                version: distr.cargo_toml.package.version,
            },
        })
        .ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(put::route))
        .with_state(state.clone())
}
