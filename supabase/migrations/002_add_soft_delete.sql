-- Add deleted_at column to products table
alter table public.products
add column if not exists deleted_at timestamptz default null;

-- Update product_read_model view to exclude deleted products
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
where p.deleted_at is null
group by p.id, p.name, p.price, p.total_stock, p.image_path;
