update public.social_quiz_questions
set prompt='Qual regional de Betim faz mais parte da sua rotina?',
    help_text='Pode ser onde você mora, trabalha, estuda ou passa mais tempo.',
    options='["Alterosas","Centro","Citrolândia","Icaivera","Imbiruçu","Norte","Petrovale","PTB","Teresópolis","Vianópolis","Não sei qual é minha regional","Não moro em Betim","Prefiro não informar"]'::jsonb
where code='regional';
