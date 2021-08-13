import { Hook } from "@oclif/config";
import * as libnpm from "libnpm";
import * as semver from "semver";
import * as fs from "fs-extra";
import * as path from "path";
import cli from "cli-ux";
import template from "lodash.template";
import chalk from "chalk";

const hook: Hook<"postrun"> = async function ({ config }) {
  const { name: packageName, version: currentVersion } = config;
  // Destructure package.json configuration with defaults
  const {
    timeoutInDays = 60,
    message = "<%= config.name %> update available from <%= chalk.greenBright(config.version) %> to <%= chalk.greenBright(latest) %>.",
  } = (config.pjson.oclif as any)["warn-if-update-available"] || {};
  const updateCheckPath = path.join(config.cacheDir, "last-update-check");

  const refreshNeeded = async () => {
    try {
      const { mtime } = await fs.stat(updateCheckPath);
      const staleAt = new Date(
        mtime.valueOf() + 1000 * 60 * 60 * 24 * timeoutInDays
      );
      return staleAt < new Date();
    } catch (error) {
      return true;
    }
  };

  // handle the situation where the host cli has not yet published a package. if this
  // plugin is installed on it, it will always fail the check since the registry will
  // return a 404. by catching the 404 and returning null, we get the chance to write the
  // last-update-check file so that we can avoid checking each time. the content being
  // null is a handled case in `checkVersion`.
  const readLatestRemoteManifest = async (): Promise<any | null> => {
    try {
      return await libnpm.manifest(
        `${packageName}@latest`,
        libnpm.config.read()
      );
    } catch (error) {
      if (error.code === "E404") {
        return null;
      }
      throw error;
    }
  };

  const checkForUpdate = async () => {
    const latestManifest = await readLatestRemoteManifest();

    await fs.outputJSON(updateCheckPath, latestManifest, {
      encoding: "utf8",
    });

    // eslint-disable-next-line no-use-before-define, @typescript-eslint/no-use-before-define
    await checkVersion();
  };

  const readLatestLocalManifest = async (): Promise<any | null> => {
    try {
      return await fs.readJSON(updateCheckPath, { encoding: "utf8" });
    } catch (error) {
      return null;
    }
  };

  const checkVersion = async () => {
    const latestManifest = await readLatestLocalManifest();

    // No version check has happened, so we can't tell if we're the latest version:
    if (latestManifest === null) {
      return null;
    }

    if (semver.lt(currentVersion, latestManifest.version)) {
      this.log(
        template(message)({
          chalk,
          config,
          latest: latestManifest.version,
        })
      );
    }
  };

  if (await refreshNeeded()) {
    await checkForUpdate();
  } else {
    await checkVersion();
  }
};

export default hook;
