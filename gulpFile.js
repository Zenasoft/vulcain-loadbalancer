var os = require('os');
var Path = require('path');
var fs = require('fs');

var gulp = require("gulp"),
    ts = require("gulp-typescript"),
    merge = require('merge2'),
    fse = require('fs-extra'),
    mocha = require('gulp-mocha'),
    istanbul = require('gulp-istanbul'),
    sourcemaps = require('gulp-sourcemaps'),
    concat = require("gulp-concat"),
    tslint = require("gulp-tslint");

// Base root directory for source map
process.on('uncaughtException', console.error.bind(console));

gulp.task('default', [ 'compile-ts' ]);

gulp.task('tslint', function () {
    return gulp.src('./src/**/*.ts')
        .pipe(tslint())
        .pipe(tslint.report("prose"));
});

// -----------------------------------
// Test
// -----------------------------------
gulp.task("compile-test", ['compile-ts'], function () {
    var tsProject = ts.createProject(
        './tsconfig.json',
        {
            typescript: require('typescript')    // must be a project package dependency
        });

    var tsResult = gulp.src([
        "./test/**/*.ts"
    ], { base: 'test/' })
        .pipe(sourcemaps.init())
        .pipe(tsProject());

    return tsResult.js
        .pipe(sourcemaps.write('.', {includeContent:false, sourceRoot: "../test"}))
        .pipe(gulp.dest("dist-test/"));
});

gulp.task("istanbul:hook", function() {
    return gulp.src(['dist/**/*.js'])
        // Covering files
        .pipe(istanbul())
        // Force `require` to return covered files
        .pipe(istanbul.hookRequire());
});

// https://www.npmjs.com/package/gulp-typescript
gulp.task("compile-ts", [  ], function ()
{
    //incrementVersion();
    var tsProject = ts.createProject(
        './tsconfig.json',
        {
            typescript: require('typescript')    // must be a project package dependency
        });

    var tsResult = gulp.src([
                "./src/**/*.ts"
            ])
            .pipe(sourcemaps.init())
            .pipe(tsProject());

    return merge([
            tsResult.dts
                .pipe(gulp.dest('dist')),
            tsResult.js
                .pipe(sourcemaps.write('.', {includeContent:false, sourceRoot: "."}))
                .pipe(gulp.dest('dist'))
        ]
    );
});

gulp.task('clean', function(done) { fse.remove('dist', done);});
