import type { MetadataRoute } from "next";
import { publicPaths, siteOrigin } from "../lib/site";
export default function sitemap(): MetadataRoute.Sitemap { return publicPaths.map(path => ({ url: siteOrigin + path })); }
