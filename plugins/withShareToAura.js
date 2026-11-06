// Adds "Share → Aura", a share extension that opens shared YouTube Music links in the app
// (plugins/share-extension). It passes the link in an aura:// URL, so it needs no App Group,
// which keeps it working when the IPA is re-signed with a free Apple ID.
// Modelled on expo-share-intent's target setup (MIT).

const fs = require("fs");
const path = require("path");
const { withXcodeProject } = require("expo/config-plugins");

const NAME = "AuraShare";
const FILES = ["ShareViewController.swift", "Info.plist"];

module.exports = function withShareToAura(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const root = config.modRequest.platformProjectRoot;
    const bundleId = `${config.ios.bundleIdentifier}.share`;

    const folder = path.join(root, NAME);
    fs.mkdirSync(folder, { recursive: true });
    for (const file of FILES) {
      fs.copyFileSync(path.join(__dirname, "share-extension", file), path.join(folder, file));
    }

    if (project.pbxTargetByName(NAME)) return config;

    const group = project.addPbxGroup(FILES, NAME, NAME);
    const groups = project.hash.project.objects.PBXGroup;
    for (const key of Object.keys(groups)) {
      if (typeof groups[key] === "object" && groups[key].name === undefined && groups[key].path === undefined) {
        project.addToPbxGroup(group.uuid, key);
      }
    }

    // The xcode library expects these sections to exist when adding a second target.
    const objects = project.hash.project.objects;
    objects.PBXTargetDependency = objects.PBXTargetDependency || {};
    objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {};

    const target = project.addTarget(NAME, "app_extension", NAME);
    project.addBuildPhase(["ShareViewController.swift"], "PBXSourcesBuildPhase", "Sources", target.uuid);
    project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target.uuid);
    project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);

    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const settings = configurations[key].buildSettings;
      if (!settings || settings.PRODUCT_NAME !== `"${NAME}"`) continue;
      Object.assign(settings, {
        INFOPLIST_FILE: `"${NAME}/Info.plist"`,
        GENERATE_INFOPLIST_FILE: "YES",
        PRODUCT_BUNDLE_IDENTIFIER: `"${bundleId}"`,
        IPHONEOS_DEPLOYMENT_TARGET: "16.4",
        SWIFT_VERSION: "5.0",
        TARGETED_DEVICE_FAMILY: `"1"`,
        CLANG_ENABLE_MODULES: "YES",
        CODE_SIGN_STYLE: "Automatic",
        MARKETING_VERSION: `"${config.version}"`,
        CURRENT_PROJECT_VERSION: `"${config.ios.buildNumber || "1"}"`,
        SKIP_INSTALL: "YES",
        APPLICATION_EXTENSION_API_ONLY: "NO",
      });
    }
    return config;
  });
};
