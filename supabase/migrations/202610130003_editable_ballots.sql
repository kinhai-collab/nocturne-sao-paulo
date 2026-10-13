create or replace function public.dining_cast_ballot(
  p_poll text, p_sub text, p_name text, p_email text,
  p_choices text[], p_nonce text, p_origin text, p_publish_initial boolean
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare prior text[];
begin
  if not exists (select 1 from public.dining_challenges
      where nonce=p_nonce and origin=p_origin and poll_id=p_poll and expires_at>now()) then
    raise exception 'Sign-in expired. Please sign in again.';
  end if;
  if p_poll <> 'sao-paulo-2026' or cardinality(p_choices) not between 1 and 5
    or cardinality(p_choices) <> (select count(distinct x) from unnest(p_choices) x)
    or not (p_choices <@ array['evvai','tuju','d-o-m','fame-osteria','jun-sakamoto','kan-suke','kanoe','kazuo','kinoshita','kuro','mani','murakami','oizumi-sushi','picchi','ryo-gastronomia','tangara-jean-georges']) then
    raise exception 'Choose 1–5 distinct restaurants.';
  end if;
  select array_agg(x order by x) into p_choices from unnest(p_choices) x;
  insert into public.dining_ballots(poll_id,google_sub,name,email,choices,public_initial)
    values(p_poll,p_sub,left(p_name,300),left(p_email,300),p_choices,case when p_publish_initial then upper(substring(trim(p_name) from '^[[:alpha:]]')) else null end)
    on conflict (poll_id,google_sub) do update set choices=excluded.choices, name=excluded.name, email=excluded.email, public_initial=coalesce(excluded.public_initial,public.dining_ballots.public_initial);
  select choices into prior from public.dining_ballots where poll_id=p_poll and google_sub=p_sub;
  if prior <> p_choices then raise exception 'This Google account has already submitted a different ballot.'; end if;
  return true;
end $$;
revoke all on function public.dining_cast_ballot(text,text,text,text,text[],text,text,boolean) from public, anon, authenticated;
grant execute on function public.dining_cast_ballot(text,text,text,text,text[],text,text,boolean) to service_role;


update public.dining_ballots set public_initial=upper(substring(trim(name) from '^[[:alpha:]]')) where public_initial is null;
