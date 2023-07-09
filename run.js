const { DatabaseConnection } = require('./build/data');
const { Server } = require('./build/server');

DatabaseConnection.FormatDatabase().then(() => {
    process.exit();
});