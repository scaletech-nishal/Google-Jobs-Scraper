import { apikey, sequence_id, showBrowser } from "./config";
import { browser } from "@crawlora/browser";

export default async function ({ searches }: { searches: string }) {
  const formedData = searches
    .trim()
    .split("\n")
    .map((v) => v.trim());

  await browser(
    async ({ page, wait, output, debug }) => {
      debug("Starting the browser session");

      for await (const search of formedData) {
        debug(`Processing search term: ${search}`);

        const url: string = `https://www.google.com/search?q=${encodeURIComponent(
          search
        )}&sourceid=chrome&ie=UTF-8&ibp=htl;jobs`;

        debug(`Navigating to URL: ${url}`);
        await page.goto(url, { waitUntil: "networkidle2" });

        debug("Page loaded, waiting for 3 seconds");
        await wait(3);

        let lastHeight = await page.evaluate(() => document.body.scrollHeight);
        debug(`Initial scroll height: ${lastHeight}`);

        while (true) {
          debug("Scrolling down to the bottom of the page");
          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight)
          );

          await wait(2);
          const newHeight = await page.evaluate(
            () => document.body.scrollHeight
          );
          debug(`New scroll height: ${newHeight}`);

          if (newHeight === lastHeight) {
            debug("Reached the bottom of the page, stopping scroll");
            break;
          }
          lastHeight = newHeight;
        }

        debug("Waiting for job listings selector");
        await page.waitForSelector(".gmxZue");

        debug("Extracting job elements from the page");
        const jobElements = await page.evaluate((searchTerm) => {
          const elements = document.querySelectorAll(".gmxZue");

          return Array.from(elements).map((element) => {
            const jobDataChildElement =
              element?.children[0]?.children[0].children;
            const jobPostChildElement = element?.children[1].children;

            let Job_post_time = "";
            let Employment_type = "";
            let Salary = "";

            Array.from(jobPostChildElement).forEach((childElement) => {
              const ariaLabel =
                childElement?.children[1]?.getAttribute("aria-label");

              if (ariaLabel) {
                if (ariaLabel.includes("Posted")) {
                  Job_post_time = ariaLabel.split("Posted")[1];
                }
                if (ariaLabel.includes("Employment")) {
                  Employment_type = ariaLabel.split("Employment type")[1];
                }
                if (ariaLabel.includes("Salary")) {
                  Salary = ariaLabel.split("Salary")[1];
                }
              }
            });

            return {
              Keyword: searchTerm,
              Job_title: jobDataChildElement[0].textContent || "No title",
              Company: jobDataChildElement[1].textContent || "No company",
              Source:
                jobDataChildElement[2].textContent
                  ?.split("•")[1]
                  .replace("via ", "")
                  .trim() || "No Source",
              Job_post_time,
              Employment_type,
              Salary,
              Location:
                jobDataChildElement[2].textContent?.split("•")[0].trim() ||
                "No location",
            };
          });
        }, search);

        debug(
          `Found ${jobElements.length} job elements for search term: ${search}`
        );

        debug("Uploading job elements to the output");
        await Promise.all(
          jobElements.map((job) =>
            output.create({
              sequence_id,
              sequence_output: job,
            })
          )
        );

        debug(
          "Uploaded job elements, waiting for 3 seconds before next search"
        );
        await wait(3);
      }

      debug("All searches processed");
    },
    { apikey, showBrowser }
  );
}
