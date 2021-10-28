Technical, experimental proof of concept for Nextjs blog, deployed to AWS very nicely via Serverless Stack, with hybrid SSG/SSR posts derived from AWS S3 objects, {fallback: "blocking"}.

Visuals and end user UI are not pretty at this stage.

To install, npm install, in root directory and frontend directory.

To deploy, npx sst deploy --stage mystagename

When deploying to a stage for the first time you should repeat the deployment operation

SSG paths: memposts/a.txt and s3posts/a.txt

SSR paths: memposts/b.txt, memposts/c.txt, s3posts/b.txt and s3posts/c.txt

Refer to documentation for Serverless Stack and Nextjs for more info.
