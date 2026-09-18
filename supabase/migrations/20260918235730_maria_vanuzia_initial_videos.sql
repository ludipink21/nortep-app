-- Conteúdo inicial de vídeos da candidata no formulário público de mobilização.
update public.surveys
set intro_video_url = 'https://www.instagram.com/reel/DcMkcNus-uj/?stkn=bGU0Y3BiZGY2ZTQ=',
    updated_at = now()
where id = '02f210cd-2cfa-443e-9116-d315a3e71060'::uuid;

insert into public.mobilization_videos (survey_id, title, video_url, description, sort_order, active)
select '02f210cd-2cfa-443e-9116-d315a3e71060'::uuid,
       'Vídeo 2',
       'https://www.instagram.com/reel/C8706HHylm5/?stkn=MWkzY25tbGxyY3RvcA==',
       null,
       20,
       true
where not exists (
  select 1 from public.mobilization_videos
  where survey_id='02f210cd-2cfa-443e-9116-d315a3e71060'::uuid
    and video_url='https://www.instagram.com/reel/C8706HHylm5/?stkn=MWkzY25tbGxyY3RvcA=='
);

insert into public.mobilization_videos (survey_id, title, video_url, description, sort_order, active)
select '02f210cd-2cfa-443e-9116-d315a3e71060'::uuid,
       'Vídeo 3',
       'https://www.instagram.com/reel/C82pIjXyWyn/?stkn=ZTB5ajczdXFoa253',
       null,
       30,
       true
where not exists (
  select 1 from public.mobilization_videos
  where survey_id='02f210cd-2cfa-443e-9116-d315a3e71060'::uuid
    and video_url='https://www.instagram.com/reel/C82pIjXyWyn/?stkn=ZTB5ajczdXFoa253'
);
