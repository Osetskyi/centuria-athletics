# Centuria Test — full update v13.55

This is a complete site archive based on Centuria Test. It is not the main-site project.

## Install

Extract the archive and upload its contents to the Centuria Test project root, replacing files with the same names. Preserve the existing folder structure.

The update supports double technical forfeits in league matches: both teams receive a loss, neither receives points or goals, and saved match statistics remain available. Admins can select this result type when editing or adding a league match.

The database migration `SUPABASE_v1355_DOUBLE_FORFEIT.sql` enables the new match status. It has already been applied to the connected database.
