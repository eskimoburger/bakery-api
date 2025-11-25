create extension if not exists "pgcrypto";

-- Helper for updated_at column
create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- Products table
create table if not exists public.products (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    price numeric(12, 2) not null check (price >= 0),
    total_stock integer not null check (total_stock >= 0),
    image_path text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_current_timestamp_updated_at();

-- Sales table
create table if not exists public.sales (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products (id) on delete restrict,
    quantity integer not null check (quantity > 0),
    unit_price numeric(12, 2) not null check (unit_price >= 0),
    total_amount numeric(14, 2) generated always as (quantity * unit_price) stored,
    sold_at timestamptz not null default now()
);

create index if not exists sales_product_id_idx on public.sales (product_id);
create index if not exists sales_sold_at_idx on public.sales (sold_at);

-- View for product read model with computed sales stats
create or replace view public.product_read_model as
select
    p.id,
    p.name,
    p.price,
    p.total_stock as total_stock,
    p.image_path,
    coalesce(sum(s.quantity), 0)::integer as sold_quantity,
    (p.total_stock - coalesce(sum(s.quantity), 0)::integer) as remaining_stock
from public.products p
left join public.sales s on s.product_id = p.id
group by p.id, p.name, p.price, p.total_stock, p.image_path;

-- Summary RPC
create or replace function public.get_stats_summary()
returns table (
    total_products bigint,
    total_stock bigint,
    total_sold_quantity bigint,
    total_remaining_stock bigint
) language sql stable as $$
    select
        count(*)::bigint as total_products,
        coalesce(sum(total_stock), 0)::bigint as total_stock,
        coalesce(sum(sold_quantity), 0)::bigint as total_sold_quantity,
        coalesce(sum(remaining_stock), 0)::bigint as total_remaining_stock
    from public.product_read_model;
$$;

-- Best sellers RPC
create or replace function public.get_best_sellers(from_ts timestamptz default null, to_ts timestamptz default null)
returns json language sql stable as $$
    with filtered_sales as (
        select s.*, p.name as product_name, p.price as current_price
        from public.sales s
        join public.products p on p.id = s.product_id
        where (from_ts is null or s.sold_at >= from_ts)
          and (to_ts is null or s.sold_at <= to_ts)
    ),
    aggregated as (
        select
            product_id,
            max(product_name) as name,
            max(current_price) as price,
            sum(quantity) as sold_quantity,
            sum(total_amount) as total_revenue
        from filtered_sales
        group by product_id
    ),
    best_by_quantity as (
        select * from aggregated
        order by sold_quantity desc, product_id
        limit 1
    ),
    best_by_revenue as (
        select * from aggregated
        order by total_revenue desc, product_id
        limit 1
    )
    select json_build_object(
        'bestByQuantity',
        (
            select json_build_object(
                'productId', bq.product_id,
                'name', bq.name,
                'price', bq.price,
                'soldQuantity', bq.sold_quantity
            )
            from best_by_quantity bq
        ),
        'bestByRevenue',
        (
            select json_build_object(
                'productId', br.product_id,
                'name', br.name,
                'price', br.price,
                'soldQuantity', br.sold_quantity,
                'totalRevenue', br.total_revenue
            )
            from best_by_revenue br
        )
    );
$$;
