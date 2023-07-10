const { DatabaseConnection } = require('./build/data');
DatabaseConnection.FormatDatabase(process.argv.includes('-f')).then(() => {
    process.exit();
});