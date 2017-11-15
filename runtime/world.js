'use strict';

/**
 * world.js is loaded by the cucumber framework before loading the step definitions and feature files
 * it is responsible for setting up and exposing the driver/browser/expect/assert etc required within each step definition
 */

var fs = require('fs-plus');
var path = require('path');
var requireDir = require('require-dir');
var merge = require('merge');
var chalk = require('chalk');
var selenium = require('selenium-webdriver');
var expect = require('chai').expect;
var assert = require('chai').assert;
var reporter = require('cucumber-html-reporter');
var cucumberJunit = require('cucumber-junit');

// drivers
// var FireFoxDriver = require('./firefoxDriver.js');
var PhantomJSDriver = require('./phantomDriver.js');
var ChromeDriver = require('./chromeDriver');

/**
 * create the selenium browser based on global var set in index.js
 * @returns {ThenableWebDriver} selenium web driver
 */
function getDriverInstance() {

    var driver;

    switch (browserName || '') {

        // case 'firefox': {
        //     driver = new FireFoxDriver();
        // } break;

        case 'phantomjs': {
            driver = new PhantomJSDriver();
        } break;

        case 'chrome': {
            driver = new ChromeDriver();
        } break;

        // try to load from file
        default: {
            var driverFileName = path.resolve(process.cwd(), browserName);

            if (!fs.isFileSync(driverFileName)) {
                throw new Error('Could not find driver file: ' + driverFileName);
            }
            driver = require(driverFileName)();
        }
    }

    return driver;
}

function consoleInfo() {
    var args = [].slice.call(arguments),
        output = chalk.bgBlue.white('\n>>>>> \n' + args + '\n<<<<<\n');

    console.log(output);
}

/**
 * Creates a list of variables to expose globally and therefore accessible within each step definition
 * @returns {void}
 */
function createWorld() {

    var runtime = {
        driver: null,               // the browser object
        selenium: selenium,         // the raw nodejs selenium driver
        By: selenium.By,            // in keeping with Java expose selenium By
        by: selenium.By,            // provide a javascript lowercase version
        until: selenium.until,      // provide easy access to selenium until methods
        expect: expect,             // expose chai expect to allow variable testing
        assert: assert,             // expose chai assert to allow variable testing
        trace: consoleInfo,         // expose an info method to log output to the console in a readable/visible format
        page: global.page || {},    // empty page objects placeholder
        shared: global.shared || {} // empty shared objects placeholder
    };

    // expose properties to step definition methods via global variables
    Object.keys(runtime).forEach(function (key) {

        // make property/method available as a global (no this. prefix required)
        global[key] = runtime[key];
    });
}

/**
 * Import shared objects, pages object and helpers into global scope
 * @returns {void}
 */
function importSupportObjects() {

    // import shared objects from multiple paths (after global vars have been created)
    if (global.sharedObjectPaths && Array.isArray(global.sharedObjectPaths) && global.sharedObjectPaths.length > 0) {

        var allDirs = {};

        // first require directories into objects by directory
        global.sharedObjectPaths.forEach(function (itemPath) {

            if (fs.existsSync(itemPath)) {

                var dir = requireDir(itemPath, { camelcase: true });

                merge(allDirs, dir);
            }
        });

        // if we managed to import some directories, expose them
        if (Object.keys(allDirs).length > 0) {

            // expose globally
            global.shared = allDirs;
        }
    }

    // import page objects (after global vars have been created)
    if (global.pageObjectPath && fs.existsSync(global.pageObjectPath)) {

        // require all page objects using camel case as object names
        global.page = requireDir(global.pageObjectPath, { camelcase: true });
    }

    // add helpers
    global.helpers = require('../runtime/helpers.js');
}

// export the "World" required by cucumber to allow it to expose methods within step def's
module.exports = function () {

    createWorld();
    importSupportObjects();

    // this.World must be set!
    this.World = createWorld;

    // set the default timeout for all tests
    this.setDefaultTimeout(global.DEFAULT_TIMEOUT);

    // create the driver before scenario if it's not instantiated
    this.registerHandler('BeforeScenario', function(scenario) {

        if (!global.driver) {
            global.driver = getDriverInstance();
        }
    });

    this.registerHandler('AfterFeatures', function (features, done) {

        var cucumberReportPath = path.resolve(global.reportsPath, 'cucumber-report.json');

        if (global.reportsPath && fs.existsSync(global.reportsPath)) {

            // generate the HTML report
            var reportOptions = {
                theme: 'bootstrap',
                jsonFile: cucumberReportPath,
                output: path.resolve(global.reportsPath, 'cucumber-report.html'),
                reportSuiteAsScenarios: true,
                launchReport: (!global.disableLaunchReport),
                ignoreBadJsonFile: true
            };

            reporter.generate(reportOptions);

            // grab the file data
            var reportRaw = fs.readFileSync(cucumberReportPath).toString().trim();
            var xmlReport = cucumberJunit(reportRaw);
            var junitOutputPath = path.resolve(global.junitPath, 'junit-report.xml');

            fs.writeFileSync(junitOutputPath, xmlReport);
        }

        done();
    });

    // executed after each scenario (always closes the browser to ensure fresh tests)
    this.After(function (scenario) {

        if (scenario.isFailed() && !global.noScreenshot) {

            // add a screenshot to the error report
            return driver.takeScreenshot().then(function (screenShot) {

                scenario.attach(new Buffer(screenShot, 'base64'), 'image/png');

                return driver.close().then(function() {
                    return driver.quit();
                });
            });
        }

        return driver.close().then(function() {
            return driver.quit();
        });
    });
};
