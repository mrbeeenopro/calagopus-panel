use shared::extensions::commands::CliCommandGroupBuilder;

mod create;
mod mass_import;

pub fn commands(cli: CliCommandGroupBuilder) -> CliCommandGroupBuilder {
    cli.add_command(
        "create",
        "Creates a new nest for the Panel.",
        create::CreateCommand,
    )
    .add_command(
        "mass-import",
        "Mass-imports a folder of eggs into a nest.",
        mass_import::MassImportCommand,
    )
}
