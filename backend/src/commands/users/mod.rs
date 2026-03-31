use shared::extensions::commands::CliCommandGroupBuilder;

mod create;
mod disable_2fa;
mod reset_password;

pub fn commands(cli: CliCommandGroupBuilder) -> CliCommandGroupBuilder {
    cli.add_command(
        "create",
        "Creates a new user for the Panel.",
        create::CreateCommand,
    )
    .add_command(
        "disable-2fa",
        "Disables two-factor authentication for a user.",
        disable_2fa::Disable2FACommand,
    )
    .add_command(
        "reset-password",
        "Resets a user's password.",
        reset_password::ResetPasswordCommand,
    )
}
