use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod manage;

mod get {
    use serde::Serialize;
    use shared::{
        GetState,
        models::user::GetPermissionManager,
        response::{ApiResponse, ApiResponseResult},
    };
    use utoipa::ToSchema;

    #[derive(ToSchema, Serialize)]
    struct Response<'a> {
        #[schema(inline)]
        extensions: &'a [shared::extensions::ConstructedExtension],
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
    ))]
    pub async fn route(state: GetState, permissions: GetPermissionManager) -> ApiResponseResult {
        permissions.has_admin_permission("extensions.read")?;

        ApiResponse::new_serialized(Response {
            extensions: &state.extensions.extensions().await,
        })
        .ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .nest("/manage", manage::router(state))
        .routes(routes!(get::route))
        .with_state(state.clone())
}
