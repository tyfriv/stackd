/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as comments from "../comments.js";
import type * as feeds_feedGeneration from "../feeds/feedGeneration.js";
import type * as feeds_feedHelpers from "../feeds/feedHelpers.js";
import type * as forum_activity from "../forum/activity.js";
import type * as forum_categories from "../forum/categories.js";
import type * as forum_index from "../forum/index.js";
import type * as forum_replies from "../forum/replies.js";
import type * as forum_search from "../forum/search.js";
import type * as forum_threads from "../forum/threads.js";
import type * as lib_apiHelpers from "../lib/apiHelpers.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_logger from "../lib/logger.js";
import type * as lib_notificationHelpers from "../lib/notificationHelpers.js";
import type * as lib_validation from "../lib/validation.js";
import type * as logs_logOperations from "../logs/logOperations.js";
import type * as media_mediaQueries from "../media/mediaQueries.js";
import type * as media_rawg from "../media/rawg.js";
import type * as media_spotify from "../media/spotify.js";
import type * as media_tmdb from "../media/tmdb.js";
import type * as rateLimits from "../rateLimits.js";
import type * as reactions from "../reactions.js";
import type * as search_globalSearch from "../search/globalSearch.js";
import type * as search_searchHelpers from "../search/searchHelpers.js";
import type * as showcases_index from "../showcases/index.js";
import type * as showcases_showcaseHelpers from "../showcases/showcaseHelpers.js";
import type * as showcases_showcaseOperations from "../showcases/showcaseOperations.js";
import type * as showcases_showcaseSearch from "../showcases/showcaseSearch.js";
import type * as showcases_showcaseUtils from "../showcases/showcaseUtils.js";
import type * as socials_blocks from "../socials/blocks.js";
import type * as socials_follows from "../socials/follows.js";
import type * as socials_notifications from "../socials/notifications.js";
import type * as socials_utils from "../socials/utils.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  comments: typeof comments;
  "feeds/feedGeneration": typeof feeds_feedGeneration;
  "feeds/feedHelpers": typeof feeds_feedHelpers;
  "forum/activity": typeof forum_activity;
  "forum/categories": typeof forum_categories;
  "forum/index": typeof forum_index;
  "forum/replies": typeof forum_replies;
  "forum/search": typeof forum_search;
  "forum/threads": typeof forum_threads;
  "lib/apiHelpers": typeof lib_apiHelpers;
  "lib/constants": typeof lib_constants;
  "lib/errors": typeof lib_errors;
  "lib/logger": typeof lib_logger;
  "lib/notificationHelpers": typeof lib_notificationHelpers;
  "lib/validation": typeof lib_validation;
  "logs/logOperations": typeof logs_logOperations;
  "media/mediaQueries": typeof media_mediaQueries;
  "media/rawg": typeof media_rawg;
  "media/spotify": typeof media_spotify;
  "media/tmdb": typeof media_tmdb;
  rateLimits: typeof rateLimits;
  reactions: typeof reactions;
  "search/globalSearch": typeof search_globalSearch;
  "search/searchHelpers": typeof search_searchHelpers;
  "showcases/index": typeof showcases_index;
  "showcases/showcaseHelpers": typeof showcases_showcaseHelpers;
  "showcases/showcaseOperations": typeof showcases_showcaseOperations;
  "showcases/showcaseSearch": typeof showcases_showcaseSearch;
  "showcases/showcaseUtils": typeof showcases_showcaseUtils;
  "socials/blocks": typeof socials_blocks;
  "socials/follows": typeof socials_follows;
  "socials/notifications": typeof socials_notifications;
  "socials/utils": typeof socials_utils;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
