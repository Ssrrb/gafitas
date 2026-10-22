// Zod's JIT probes for eval with `new Function`, which the page's CSP forbids (and reports). Turn the JIT off
// before any schema is built; this module is imported first.
import { z } from "zod/v4";

z.config({ jitless: true });
