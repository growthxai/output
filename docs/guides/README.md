# Output Framework Documentation

## Development

The [Mintlify CLI](https://www.npmjs.com/package/mint) is not a project dependency; it is installed inside the container built from `ops/mint.Dockerfile`. Preview your documentation changes locally from the repo root:

```
./run.sh docs:mint
```

View your local preview at `http://localhost/`.

## Publishing changes

Install our GitHub app from your [dashboard](https://dashboard.mintlify.com/settings/organization/github-app) to propagate changes from your repo to your deployment. Changes are deployed to production automatically after pushing to the default branch.

## Need help?

### Troubleshooting

- If your dev environment isn't running: Rebuild the image with `docker build --no-cache -f ./ops/mint.Dockerfile -t mint .` to pick up the most recent version of the CLI.
- If a page loads as a 404: Make sure `docs/guides/docs.json` is valid.

### Resources
- [Mintlify documentation](https://mintlify.com/docs)
