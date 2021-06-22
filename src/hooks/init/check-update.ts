import { Hook } from "@oclif/config";
import * as libnpm from "libnpm";
import * as semver from "semver";
import * as fs from "fs-extra";
import * as path from "path";
import cli from "cli-ux";

const timeoutInDays = 10;

const hook: Hook<"init"> = async function ({ config }) {
  const { name: packageName, version: currentVersion } = config;
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

  const checkForUpdate = async () => {
    try {
      cli.action.start("checking for updates");

      const latestManifest = await libnpm.manifest(
        `${packageName}@latest`,
        libnpm.config.read()
      );

      await fs.writeFile(updateCheckPath, JSON.stringify(latestManifest), {
        encoding: "utf8",
      });
    } catch (error) {
      // when the host has not yet published any packages, the registry will return a 404.
      // we swallow this error to avoid erroring out the host cli
      if (error.code !== "E404") {
        throw error;
      }
    } finally {
      cli.action.stop();
    }

    // eslint-disable-next-line no-use-before-define, @typescript-eslint/no-use-before-define
    await checkVersion(true);
  };

  const readLatestManifest = async (): Promise<any | null> => {
    try {
      return JSON.parse(
        await fs.readFile(updateCheckPath, {
          encoding: "utf8",
        })
      );
    } catch (error) {
      return null;
    }
  };

  const checkVersion = async (printStatus?: boolean) => {
    const latestManifest = await readLatestManifest();

    // No version check has happened, so we can't tell if we're the latest version:
    if (latestManifest === null) {
      return null;
    }

    if (semver.lt(currentVersion, latestManifest.version)) {
      this.warn(
        `Update needed, please run \`yarn global add ${packageName}@latest\`\n`
      );
    } else if (printStatus) {
      this.log("All up-to-date!\n");
    }
  };

  if (await refreshNeeded()) {
    await checkForUpdate();
  } else {
    await checkVersion();
  }
};

export default hook;
