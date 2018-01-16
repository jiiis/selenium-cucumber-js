'use strict';

var webDriver = require('selenium-webdriver');
var seleniumDrivers = require('selenium-drivers');

module.exports = function(browserName) {
    return seleniumDrivers.init({
        browserName: browserName,
        download: true
    }).then(function() {
        return new webDriver.Builder().forBrowser(browserName).build();
    });
};
