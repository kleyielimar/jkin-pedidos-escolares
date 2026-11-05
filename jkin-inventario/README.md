# JK Innovations — workshop inventory (Fase 0 + Fase 1)

Inventario del taller para Norma Muñoz. Inglés por defecto, español en EN | ES.
Esta carpeta es una app nueva. No reemplaza `inventario.html` (la versión pública que ya está en GitHub Pages) ni el panel de pedidos escolares en `jkin-web/`.

Draft only. Do not merge this branch, and do not point GitHub Pages at it.

## What this is

A static app in `jkin-inventario/` for the whole workshop: products and SKUs, a stock ledger, and multi-line orders. It uses the same Supabase project as the school panel (`https://ixeqzkdivqbnmgvoefvt.supabase.co`) and the same publishable browser key already in `jkin-web/js/config.js`. There is no service-role key in the frontend.

### Why schema `inventory`

School orders already use `public.schools`, `public.products`, `public.orders`, `public.order_lines`, and related tables. This app does not create or alter anything in `public`. All inventory tables, views, and functions live in the schema **`inventory`**, so the two apps cannot collide. A table prefix such as `inv_` was the other option; the schema keeps the names readable (`inventory.variants` instead of `public.inv_variants`) and lets Row Level Security cover one bounded set of objects.

PostgREST does not expose a schema until it is added in the project settings. That step is required below.

## Roles

Sign-in is Supabase Auth. A signed-in user with no row in `inventory.profiles` sees only their user id. They cannot read workshop data. The first admin is granted with SQL (the app cannot grant its own first role). After that, an admin can grant other people from Directory → People.

| | Admin | Inventario | Producción |
| --- | --- | --- | --- |
| See catalog, stock, movements, orders | yes | yes | yes |
| Schools, clients, products, SKUs, orders | write | write | no |
| Delete schools, clients, products, SKUs | yes | no | no |
| Delete a draft or cancelled order | yes | yes | no |
| Record a movement (receive, adjust, count, return, correction) | yes | yes | yes |
| Insert a `fulfill` movement by hand | no | no | no |
| Change order status, including Fulfill | yes | yes | no |
| Grant or change roles | yes | no | no |

`fulfill` rows are written only by the database when an order status becomes `fulfilled`. Adjust and correction require a note. There is no update policy on movements: a mistake is a new row, not a silent edit.

At least one active admin must remain.

## Stock and money

- **Physical** is the sum of movement deltas.
- **Reserved** is the sum of line quantities on orders in `confirmed`, `in_production`, or `ready`.
- **Available** = physical − reserved.
- **In stock** means available is above the minimum. **Low** means available is above 0 and at or below the minimum. **Out** means available is 0 or less.
- Minimum defaults to **3** on each SKU and can be edited per SKU.
- **Cost** and **client price** are different columns. Order subtotal, tax, and total use the client price only. Cost is never copied onto an order line.
- CA tax is **10.75%** of the client subtotal, rounded half away from zero to the cent. The rate is fixed in `inventory.prepare_order()` and in `js/money.js`.

Order status hook for later phases (not built here):

`draft` does not reserve. `confirmed` → `in_production` → `ready` reserve stock and do not deduct it. Entering `fulfilled` posts one negative movement per line (`reason = fulfill`) and releases the reserve. `fulfilled` and `cancelled` are final. A return is a new movement with reason `return`. Delivery method and tracking are Fase 2 and are not columns yet. `orders.reference` is a free-text note for a future online id; nothing is synced to WooCommerce.

Channels: workshop, school, online, other. Online does not sync.

Youth and adult are separate size groups. Sports is a product category, not a size group.

## Screens

- Login, and a no-access screen that shows the user id to grant.
- Dashboard: in stock / low / out, available units, needs-attention list, reorder grouped by supplier, quick entry (`5 polo navy M`), CSV and JSON export, buttons to add a school, client, or product.
- Products: supplier, product number, garment, category, lead time, and SKUs with color, size, cost, client price, minimum, school, client, and design.
- Movements: a reason is required. Count sets a physical total and stores the difference.
- Orders: several lines, name on the garment, slide, sign, subtotal, CA tax, total.
- Directory for schools, clients, and (admin) people.
- EN | ES, saved in this browser under `jkin-inv-lang`.

Quick entry runs in the browser. It does not call an AI. Receive is a `receive` movement. Deduct is an `adjust` and needs a note. Adjust is a `correction` and needs a note and an explicit delta.

## Apply the database

Do this in the Supabase SQL editor for project `ixeqzkdivqbnmgvoefvt`, as the database owner. Do not run it against the school tables by hand-editing `public`.

1. Open `jkin-inventario/supabase/001_inventory_schema.sql`, paste it, and run it. The workshop stays empty. Re-running the file is safe.
2. Dashboard → **Project Settings → Data API** (some projects still label this **API**) → **Exposed schemas**. Add `inventory` and keep `public`. Save.
3. If the app still says the schema is missing, run `notify pgrst, 'reload schema';` once.
4. Authentication → add the person (email and password), or have them open the app and use “Email a reset link” after the user exists.
5. Grant the first admin. Edit the email in `supabase/grant_admin.example.sql` and run that file once. The file refuses to run while the placeholder email is still there. Further people can be granted in the app: they sign in, copy the user id from the no-access screen, and an admin pastes it under Directory → People.

### Optional demo seed

`supabase/002_seed_demo.sql` inserts a fictional school, three products (uniform, sports, and a general beanie), movements, and one confirmed multi-line order. It does not create logins. **Do not run it** if this database is about to hold a real count. Running it twice does not duplicate the sample rows.

After the demo seed, navy youth M is in stock (physical 12, reserved 2, available 10), navy adult M is low (2, minimum 3), and maroon YXS is out. The sample order total is $64.24 = $58.00 client subtotal + $6.24 tax. Cost on that polo is $8.50 and is not part of the total.

## Run it locally

From the repository root:

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173/jkin-inventario/`.

Use a local server. Opening `index.html` as a file will not load the modules. The page is served from this folder only; the root `inventario.html` is a different file and is unchanged.

There is no build step. Checks that do not touch Supabase:

```bash
cd jkin-inventario
node --test test/logic.test.js
```

`test/run-sql.sh` builds a throwaway local database named `jkin_inv_test` and checks stock math, tax, the ledger, and RLS. It needs PostgreSQL on the machine. It does not connect to the hosted project.

## GitHub Pages

The public site should keep serving `/inventario.html` from `main`. This branch must not be published and must not be merged just to preview.

After a future, deliberate merge, the new app would be available beside the old one at `/jkin-inventario/` without replacing `/inventario.html`. Do not change the Pages source, and do not copy this app over `inventario.html`.

## Out of scope here

- School orders and anything under `jkin-web/` or `supabase/*.sql` at the repo root.
- WooCommerce sync and Woo PDF import (Fase 3).
- Delivery method, mail versus pickup, and required tracking (Fase 2). The fulfill status is the hook those rules can gate later.
- Email alerts, a full supplier admin, and the four PDF reports (Fase 4). Supplier is a text field plus lead time in days.
- Systeme.io iframe embedding.

## Layout

```
jkin-inventario/
  index.html          login and the app shell
  css/app.css         JK colors (terracotta, deep blue, paper)
  js/                 screens, quick entry, tax, CSV/JSON
  supabase/           001 schema, optional 002 demo, admin example
  test/               parser, tax, render checks, local SQL checks
```

The browser Supabase client in `js/vendor/supabase.js` is the same build the school panel already vendors, copied so this folder can be opened on its own.
