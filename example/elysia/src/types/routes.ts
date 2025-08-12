import type { ElysiaWithBaseUrl } from "elysia-autoload";
import type Route0 from "../routes/index";
import type Route1 from "../routes/some";

declare global {
    export type Route = ElysiaWithBaseUrl<"/", typeof Route0>
        & ElysiaWithBaseUrl<"/some", typeof Route1>
}