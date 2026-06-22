const minimumMajor = 20;
const major = Number(process.versions.node.split(".")[0]);

if (major < minimumMajor) {
  console.error(
    [
      `Node.js ${minimumMajor}+ is required.`,
      `Current version: ${process.version}`,
      "",
      "Install a newer Node.js runtime, then reinstall dependencies:",
      "  rm -rf node_modules package-lock.json",
      "  npm install",
      "  npm run build"
    ].join("\n")
  );
  process.exit(1);
}

