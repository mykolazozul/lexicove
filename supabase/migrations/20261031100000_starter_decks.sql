-- Starter decks: four ready-made word lists (A1 to B2), so someone without Notion or a CSV can
-- start learning a minute after signing up. Duels draw their questions from the same words, so
-- both players get a fair pool no matter what they keep in their own lists.

create table public.deck_words (
  id integer generated always as identity primary key,
  deck text not null check (deck in ('a1', 'a2', 'b1', 'b2')),
  sort integer not null,
  word text not null,
  translation text not null,
  pronunciation text not null default '',
  example text not null default '',
  category text not null default '',
  unique (deck, word)
);

alter table public.deck_words enable row level security;
create policy "Anyone can read the starter decks" on public.deck_words for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.deck_words from anon, authenticated;

-- Each deck, how many of its words the caller already has, and a few to preview.
create function public.starter_decks()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('deck', d.deck, 'count', d.total, 'added', d.added, 'sample', d.sample) order by d.deck), '[]')
  from (
    select
      dw.deck,
      count(*)::integer as total,
      count(*) filter (where exists (
        select 1 from public.words w
        where w.user_id = (select auth.uid()) and w.deleted_at is null and lower(w.word) = lower(dw.word)
      ))::integer as added,
      (array_agg(dw.word order by dw.sort))[1:6] as sample
    from public.deck_words dw
    group by dw.deck
  ) d;
$$;

-- Copies a deck into the caller's words, skipping words they already have. Runs with the caller's
-- rights, so the usual policies and the per-user row limit apply.
create function public.add_starter_deck(p_deck text, p_to_notion boolean default false)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  source uuid;
  added integer;
begin
  if uid is null then
    raise exception 'sign_in_first';
  end if;
  if p_to_notion then
    select id into source from public.notion_sources where user_id = uid and kind = 'words' order by created_at limit 1;
  end if;

  insert into public.words (user_id, word, translation, pronunciation, examples, category, added_on, source_id, needs_push)
  select uid, d.word, d.translation, d.pronunciation, d.example, d.category,
    (now() at time zone private.my_time_zone())::date, source, source is not null
  from public.deck_words d
  where d.deck = p_deck
    and not exists (
      select 1 from public.words w where w.user_id = uid and w.deleted_at is null and lower(w.word) = lower(d.word)
    )
  order by d.sort;
  get diagnostics added = row_count;
  return added;
end;
$$;

revoke all on function public.starter_decks() from public, anon;
grant execute on function public.starter_decks() to authenticated;
revoke all on function public.add_starter_deck(text, boolean) from public, anon;
grant execute on function public.add_starter_deck(text, boolean) to authenticated;

-- ---------- The words ----------

insert into public.deck_words (deck, sort, word, translation, pronunciation, example, category) values
  -- A1 · Beginner
  ('a1', 1, 'apple', 'яблуко', '/ˈæpəl/', 'I eat an apple every morning.', '🍽️ Food'),
  ('a1', 2, 'bread', 'хліб', '/bred/', 'We buy fresh bread at the shop.', '🍽️ Food'),
  ('a1', 3, 'water', 'вода', '/ˈwɔːtər/', 'Can I have a glass of water?', '🍽️ Food'),
  ('a1', 4, 'cheese', 'сир', '/tʃiːz/', 'She likes cheese on her sandwich.', '🍽️ Food'),
  ('a1', 5, 'egg', 'яйце', '/eɡ/', 'He has an egg for breakfast.', '🍽️ Food'),
  ('a1', 6, 'milk', 'молоко', '/mɪlk/', 'The milk is in the fridge.', '🍽️ Food'),
  ('a1', 7, 'tea', 'чай', '/tiː/', 'Would you like a cup of tea?', '🍽️ Food'),
  ('a1', 8, 'dog', 'собака', '/dɒɡ/', 'My dog likes long walks.', '🐾 Animals'),
  ('a1', 9, 'cat', 'кіт', '/kæt/', 'The cat is sleeping on the sofa.', '🐾 Animals'),
  ('a1', 10, 'bird', 'птах', '/bɜːrd/', 'A small bird is singing outside.', '🐾 Animals'),
  ('a1', 11, 'horse', 'кінь', '/hɔːrs/', 'She rides a horse at the weekend.', '🐾 Animals'),
  ('a1', 12, 'fish', 'риба', '/fɪʃ/', 'There is a red fish in the tank.', '🐾 Animals'),
  ('a1', 13, 'cow', 'корова', '/kaʊ/', 'The cow is eating grass.', '🐾 Animals'),
  ('a1', 14, 'rabbit', 'кролик', '/ˈræbɪt/', 'Our rabbit loves carrots.', '🐾 Animals'),
  ('a1', 15, 'house', 'будинок', '/haʊs/', 'They live in a big house.', '🏠 Home & things'),
  ('a1', 16, 'door', 'двері', '/dɔːr/', 'Please close the door.', '🏠 Home & things'),
  ('a1', 17, 'window', 'вікно', '/ˈwɪndoʊ/', 'Open the window, it is hot.', '🏠 Home & things'),
  ('a1', 18, 'chair', 'стілець', '/tʃer/', 'This chair is very comfortable.', '🏠 Home & things'),
  ('a1', 19, 'bed', 'ліжко', '/bed/', 'I go to bed at ten.', '🏠 Home & things'),
  ('a1', 20, 'key', 'ключ', '/kiː/', 'I can''t find my key.', '🏠 Home & things'),
  ('a1', 21, 'table', 'стіл', '/ˈteɪbəl/', 'The books are on the table.', '🏠 Home & things'),
  ('a1', 22, 'today', 'сьогодні', '/təˈdeɪ/', 'Today is a beautiful day.', '⏱️ Time & frequency'),
  ('a1', 23, 'tomorrow', 'завтра', '/təˈmɒroʊ/', 'See you tomorrow at school.', '⏱️ Time & frequency'),
  ('a1', 24, 'morning', 'ранок', '/ˈmɔːrnɪŋ/', 'I drink coffee in the morning.', '⏱️ Time & frequency'),
  ('a1', 25, 'week', 'тиждень', '/wiːk/', 'We have English twice a week.', '⏱️ Time & frequency'),
  ('a1', 26, 'always', 'завжди', '/ˈɔːlweɪz/', 'She always smiles at people.', '⏱️ Time & frequency'),
  ('a1', 27, 'never', 'ніколи', '/ˈnevər/', 'I never eat fast food.', '⏱️ Time & frequency'),
  ('a1', 28, 'happy', 'щасливий', '/ˈhæpi/', 'The children are happy today.', '🧠 Feelings & traits'),
  ('a1', 29, 'sad', 'сумний', '/sæd/', 'Why are you so sad?', '🧠 Feelings & traits'),
  ('a1', 30, 'tired', 'втомлений', '/ˈtaɪərd/', 'I am tired after work.', '🧠 Feelings & traits'),
  ('a1', 31, 'hungry', 'голодний', '/ˈhʌŋɡri/', 'Are you hungry? Let''s eat.', '🧠 Feelings & traits'),
  ('a1', 32, 'friendly', 'привітний', '/ˈfrendli/', 'Our neighbours are very friendly.', '🧠 Feelings & traits'),
  ('a1', 33, 'angry', 'сердитий', '/ˈæŋɡri/', 'Dad is angry about the broken window.', '🧠 Feelings & traits'),
  ('a1', 34, 'get up', 'вставати', '/ɡet ʌp/', 'I get up at seven every day.', '🧩 Phrasal verbs'),
  ('a1', 35, 'sit down', 'сідати', '/sɪt daʊn/', 'Please sit down and relax.', '🧩 Phrasal verbs'),
  ('a1', 36, 'turn on', 'вмикати', '/tɜːrn ɒn/', 'Can you turn on the light?', '🧩 Phrasal verbs'),
  ('a1', 37, 'turn off', 'вимикати', '/tɜːrn ɒf/', 'Turn off the TV, please.', '🧩 Phrasal verbs'),
  ('a1', 38, 'come in', 'заходити', '/kʌm ɪn/', 'Come in and close the door.', '🧩 Phrasal verbs'),
  ('a1', 39, 'look at', 'дивитися на', '/lʊk æt/', 'Look at this beautiful picture.', '🧩 Phrasal verbs'),
  ('a1', 40, 'go back', 'повертатися', '/ɡoʊ bæk/', 'We go back home at six.', '🧩 Phrasal verbs'),

  -- A2 · Elementary
  ('a2', 1, 'vegetables', 'овочі', '/ˈvedʒtəbəlz/', 'Eat more fresh vegetables.', '🍽️ Food'),
  ('a2', 2, 'breakfast', 'сніданок', '/ˈbrekfəst/', 'We have breakfast at eight.', '🍽️ Food'),
  ('a2', 3, 'delicious', 'дуже смачний', '/dɪˈlɪʃəs/', 'This cake is delicious!', '🍽️ Food'),
  ('a2', 4, 'recipe', 'рецепт', '/ˈresəpi/', 'Can you share the recipe?', '🍽️ Food'),
  ('a2', 5, 'meal', 'прийом їжі, страва', '/miːl/', 'Dinner is my favourite meal.', '🍽️ Food'),
  ('a2', 6, 'salt', 'сіль', '/sɔːlt/', 'Add a little salt to the soup.', '🍽️ Food'),
  ('a2', 7, 'bill', 'рахунок (у кафе)', '/bɪl/', 'Can we have the bill, please?', '🍽️ Food'),
  ('a2', 8, 'wild', 'дикий', '/waɪld/', 'Wild animals live in the forest.', '🐾 Animals'),
  ('a2', 9, 'farm', 'ферма', '/fɑːrm/', 'My grandparents live on a farm.', '🐾 Animals'),
  ('a2', 10, 'pet', 'домашня тварина', '/pet/', 'Do you have a pet?', '🐾 Animals'),
  ('a2', 11, 'bear', 'ведмідь', '/ber/', 'We saw a bear in the mountains.', '🐾 Animals'),
  ('a2', 12, 'feed', 'годувати', '/fiːd/', 'Don''t forget to feed the cat.', '🐾 Animals'),
  ('a2', 13, 'insect', 'комаха', '/ˈɪnsekt/', 'A small insect landed on my arm.', '🐾 Animals'),
  ('a2', 14, 'airport', 'аеропорт', '/ˈerpɔːrt/', 'We arrived at the airport early.', '🛣️ Places & movement'),
  ('a2', 15, 'ticket', 'квиток', '/ˈtɪkɪt/', 'I bought a train ticket online.', '🛣️ Places & movement'),
  ('a2', 16, 'luggage', 'багаж', '/ˈlʌɡɪdʒ/', 'Your luggage is too heavy.', '🛣️ Places & movement'),
  ('a2', 17, 'journey', 'поїздка, подорож', '/ˈdʒɜːrni/', 'The journey took five hours.', '🛣️ Places & movement'),
  ('a2', 18, 'map', 'мапа', '/mæp/', 'Let''s check the map.', '🛣️ Places & movement'),
  ('a2', 19, 'abroad', 'за кордоном', '/əˈbrɔːd/', 'She wants to study abroad.', '🛣️ Places & movement'),
  ('a2', 20, 'station', 'вокзал, станція', '/ˈsteɪʃən/', 'The station is near my house.', '🛣️ Places & movement'),
  ('a2', 21, 'job', 'робота', '/dʒɒb/', 'He found a new job last month.', '💼 Work & business'),
  ('a2', 22, 'office', 'офіс', '/ˈɒfɪs/', 'Our office is on the fifth floor.', '💼 Work & business'),
  ('a2', 23, 'boss', 'начальник', '/bɒs/', 'My boss is on holiday.', '💼 Work & business'),
  ('a2', 24, 'salary', 'зарплата', '/ˈsæləri/', 'She got a higher salary this year.', '💼 Work & business'),
  ('a2', 25, 'meeting', 'нарада, зустріч', '/ˈmiːtɪŋ/', 'The meeting starts at ten.', '💼 Work & business'),
  ('a2', 26, 'colleague', 'колега', '/ˈkɒliːɡ/', 'My colleague helped me today.', '💼 Work & business'),
  ('a2', 27, 'interview', 'співбесіда', '/ˈɪntərvjuː/', 'I have a job interview tomorrow.', '💼 Work & business'),
  ('a2', 28, 'worried', 'стурбований', '/ˈwʌrid/', 'Mum is worried about my exam.', '🧠 Feelings & traits'),
  ('a2', 29, 'excited', 'у радісному передчутті', '/ɪkˈsaɪtɪd/', 'We are excited about the trip.', '🧠 Feelings & traits'),
  ('a2', 30, 'bored', 'знуджений', '/bɔːrd/', 'The kids are bored at home.', '🧠 Feelings & traits'),
  ('a2', 31, 'proud', 'гордий', '/praʊd/', 'I am proud of my sister.', '🧠 Feelings & traits'),
  ('a2', 32, 'lazy', 'лінивий', '/ˈleɪzi/', 'Don''t be lazy, help me!', '🧠 Feelings & traits'),
  ('a2', 33, 'kind', 'добрий', '/kaɪnd/', 'It was kind of you to help.', '🧠 Feelings & traits'),
  ('a2', 34, 'give up', 'здаватися, кидати', '/ɡɪv ʌp/', 'Don''t give up so easily.', '🧩 Phrasal verbs'),
  ('a2', 35, 'find out', 'дізнаватися', '/faɪnd aʊt/', 'I want to find out the truth.', '🧩 Phrasal verbs'),
  ('a2', 36, 'put on', 'вдягати', '/pʊt ɒn/', 'Put on your coat, it is cold.', '🧩 Phrasal verbs'),
  ('a2', 37, 'take off', 'знімати (одяг); злітати', '/teɪk ɒf/', 'Take off your shoes, please.', '🧩 Phrasal verbs'),
  ('a2', 38, 'look for', 'шукати', '/lʊk fɔːr/', 'I look for my keys every morning.', '🧩 Phrasal verbs'),
  ('a2', 39, 'wake up', 'прокидатися', '/weɪk ʌp/', 'I wake up early on Mondays.', '🧩 Phrasal verbs'),
  ('a2', 40, 'go out', 'виходити розважитися', '/ɡoʊ aʊt/', 'Let''s go out tonight.', '🧩 Phrasal verbs'),

  -- B1 · Intermediate
  ('b1', 1, 'ingredient', 'інгредієнт', '/ɪnˈɡriːdiənt/', 'Flour is the main ingredient.', '🍽️ Food'),
  ('b1', 2, 'spicy', 'гострий', '/ˈspaɪsi/', 'This curry is too spicy for me.', '🍽️ Food'),
  ('b1', 3, 'dessert', 'десерт', '/dɪˈzɜːrt/', 'We ordered ice cream for dessert.', '🍽️ Food'),
  ('b1', 4, 'portion', 'порція', '/ˈpɔːrʃən/', 'The portions here are huge.', '🍽️ Food'),
  ('b1', 5, 'boil', 'варити, кип’ятити', '/bɔɪl/', 'Boil the pasta for ten minutes.', '🍽️ Food'),
  ('b1', 6, 'leftovers', 'залишки їжі', '/ˈleftoʊvərz/', 'We had leftovers for lunch.', '🍽️ Food'),
  ('b1', 7, 'fried', 'смажений', '/fraɪd/', 'I try not to eat fried food.', '🍽️ Food'),
  ('b1', 8, 'endangered', 'під загрозою зникнення', '/ɪnˈdeɪndʒərd/', 'Tigers are an endangered species.', '🐾 Animals'),
  ('b1', 9, 'species', 'вид (тварин, рослин)', '/ˈspiːʃiːz/', 'Scientists found a new species of frog.', '🐾 Animals'),
  ('b1', 10, 'habitat', 'природне середовище', '/ˈhæbɪtæt/', 'Forests are a natural habitat for bears.', '🐾 Animals'),
  ('b1', 11, 'tame', 'ручний, приручений', '/teɪm/', 'The fox was surprisingly tame.', '🐾 Animals'),
  ('b1', 12, 'hunt', 'полювати', '/hʌnt/', 'Owls hunt at night.', '🐾 Animals'),
  ('b1', 13, 'nest', 'гніздо', '/nest/', 'Birds built a nest on our roof.', '🐾 Animals'),
  ('b1', 14, 'destination', 'пункт призначення', '/ˌdestɪˈneɪʃən/', 'Paris is a popular destination.', '🛣️ Places & movement'),
  ('b1', 15, 'commute', 'їздити на роботу', '/kəˈmjuːt/', 'I commute to work by bus.', '🛣️ Places & movement'),
  ('b1', 16, 'delay', 'затримка', '/dɪˈleɪ/', 'There was a two-hour delay.', '🛣️ Places & movement'),
  ('b1', 17, 'crowded', 'переповнений', '/ˈkraʊdɪd/', 'The train was very crowded.', '🛣️ Places & movement'),
  ('b1', 18, 'accommodation', 'житло (на час поїздки)', '/əˌkɒməˈdeɪʃən/', 'We found cheap accommodation near the beach.', '🛣️ Places & movement'),
  ('b1', 19, 'sightseeing', 'огляд визначних місць', '/ˈsaɪtsiːɪŋ/', 'We spent the whole day sightseeing.', '🛣️ Places & movement'),
  ('b1', 20, 'route', 'маршрут', '/ruːt/', 'This is the fastest route to the city.', '🛣️ Places & movement'),
  ('b1', 21, 'deadline', 'крайній термін', '/ˈdedlaɪn/', 'The deadline is next Friday.', '💼 Work & business'),
  ('b1', 22, 'experience', 'досвід', '/ɪkˈspɪriəns/', 'She has five years of experience.', '💼 Work & business'),
  ('b1', 23, 'apply', 'подавати заявку', '/əˈplaɪ/', 'I want to apply for this job.', '💼 Work & business'),
  ('b1', 24, 'skill', 'навичка', '/skɪl/', 'Communication is an important skill.', '💼 Work & business'),
  ('b1', 25, 'earn', 'заробляти', '/ɜːrn/', 'How much do you earn a month?', '💼 Work & business'),
  ('b1', 26, 'promotion', 'підвищення на посаді', '/prəˈmoʊʃən/', 'He got a promotion last year.', '💼 Work & business'),
  ('b1', 27, 'customer', 'клієнт, покупець', '/ˈkʌstəmər/', 'The customer asked for a refund.', '💼 Work & business'),
  ('b1', 28, 'confident', 'впевнений', '/ˈkɒnfɪdənt/', 'She feels confident before exams.', '🧠 Feelings & traits'),
  ('b1', 29, 'embarrassed', 'збентежений', '/ɪmˈbærəst/', 'I was embarrassed by my mistake.', '🧠 Feelings & traits'),
  ('b1', 30, 'jealous', 'заздрісний, ревнивий', '/ˈdʒeləs/', 'He is jealous of his brother.', '🧠 Feelings & traits'),
  ('b1', 31, 'reliable', 'надійний', '/rɪˈlaɪəbəl/', 'Tom is a reliable friend.', '🧠 Feelings & traits'),
  ('b1', 32, 'stubborn', 'впертий', '/ˈstʌbərn/', 'My cat is very stubborn.', '🧠 Feelings & traits'),
  ('b1', 33, 'grateful', 'вдячний', '/ˈɡreɪtfəl/', 'I am grateful for your help.', '🧠 Feelings & traits'),
  ('b1', 34, 'figure out', 'розібратися, збагнути', '/ˈfɪɡjər aʊt/', 'I can''t figure out this puzzle.', '🧩 Phrasal verbs'),
  ('b1', 35, 'run out of', 'вичерпати запас', '/rʌn aʊt əv/', 'Don''t run out of time in the exam.', '🧩 Phrasal verbs'),
  ('b1', 36, 'bring up', 'піднімати тему; виховувати', '/brɪŋ ʌp/', 'Please don''t bring up that topic again.', '🧩 Phrasal verbs'),
  ('b1', 37, 'put off', 'відкладати', '/pʊt ɒf/', 'Never put off until tomorrow what you can do today.', '🧩 Phrasal verbs'),
  ('b1', 38, 'get along', 'ладнати', '/ɡet əˈlɒŋ/', 'I get along well with my neighbours.', '🧩 Phrasal verbs'),
  ('b1', 39, 'look forward to', 'з нетерпінням чекати', '/lʊk ˈfɔːrwərd tuː/', 'I look forward to our trip.', '🧩 Phrasal verbs'),
  ('b1', 40, 'turn down', 'відхиляти; робити тихіше', '/tɜːrn daʊn/', 'Please turn down the music.', '🧩 Phrasal verbs'),

  -- B2 · Upper-intermediate
  ('b2', 1, 'nutritious', 'поживний', '/nuˈtrɪʃəs/', 'Lentils are cheap and nutritious.', '🍽️ Food'),
  ('b2', 2, 'appetite', 'апетит', '/ˈæpɪtaɪt/', 'Exercise gives me a big appetite.', '🍽️ Food'),
  ('b2', 3, 'bland', 'прісний', '/blænd/', 'The soup was a bit bland.', '🍽️ Food'),
  ('b2', 4, 'savour', 'смакувати', '/ˈseɪvər/', 'Savour every bite of this cake.', '🍽️ Food'),
  ('b2', 5, 'crave', 'дуже хотіти (чогось)', '/kreɪv/', 'I always crave chocolate in the evening.', '🍽️ Food'),
  ('b2', 6, 'staple', 'основний продукт', '/ˈsteɪpəl/', 'Rice is a staple in many countries.', '🍽️ Food'),
  ('b2', 7, 'predator', 'хижак', '/ˈpredətər/', 'The lion is a powerful predator.', '🐾 Animals'),
  ('b2', 8, 'prey', 'здобич', '/preɪ/', 'The eagle caught its prey.', '🐾 Animals'),
  ('b2', 9, 'extinct', 'вимерлий', '/ɪkˈstɪŋkt/', 'Dinosaurs have been extinct for millions of years.', '🐾 Animals'),
  ('b2', 10, 'migrate', 'мігрувати', '/ˈmaɪɡreɪt/', 'Many birds migrate south in winter.', '🐾 Animals'),
  ('b2', 11, 'breed', 'порода; розводити', '/briːd/', 'What breed is your dog?', '🐾 Animals'),
  ('b2', 12, 'wildlife', 'дика природа', '/ˈwaɪldlaɪf/', 'The park protects local wildlife.', '🐾 Animals'),
  ('b2', 13, 'itinerary', 'план подорожі', '/aɪˈtɪnəreri/', 'Our itinerary includes three cities.', '🛣️ Places & movement'),
  ('b2', 14, 'remote', 'віддалений', '/rɪˈmoʊt/', 'They live in a remote village.', '🛣️ Places & movement'),
  ('b2', 15, 'landmark', 'визначна пам’ятка', '/ˈlændmɑːrk/', 'The tower is a famous landmark.', '🛣️ Places & movement'),
  ('b2', 16, 'outskirts', 'околиці', '/ˈaʊtskɜːrts/', 'We rent a flat on the outskirts of town.', '🛣️ Places & movement'),
  ('b2', 17, 'detour', 'об’їзд', '/ˈdiːtʊr/', 'We took a detour because of roadworks.', '🛣️ Places & movement'),
  ('b2', 18, 'wander', 'блукати', '/ˈwɒndər/', 'We love to wander around old towns.', '🛣️ Places & movement'),
  ('b2', 19, 'scenic', 'мальовничий', '/ˈsiːnɪk/', 'We took the scenic road along the coast.', '🛣️ Places & movement'),
  ('b2', 20, 'negotiate', 'вести переговори', '/nɪˈɡoʊʃieɪt/', 'We need to negotiate a better price.', '💼 Work & business'),
  ('b2', 21, 'revenue', 'дохід, виручка', '/ˈrevənuː/', 'The revenue grew by twenty percent.', '💼 Work & business'),
  ('b2', 22, 'workload', 'робоче навантаження', '/ˈwɜːrkloʊd/', 'My workload is heavy this month.', '💼 Work & business'),
  ('b2', 23, 'resign', 'звільнятися (самому)', '/rɪˈzaɪn/', 'She decided to resign from her job.', '💼 Work & business'),
  ('b2', 24, 'launch', 'запускати (продукт)', '/lɔːntʃ/', 'They will launch the app in May.', '💼 Work & business'),
  ('b2', 25, 'feedback', 'відгук', '/ˈfiːdbæk/', 'Thanks for your honest feedback.', '💼 Work & business'),
  ('b2', 26, 'outsource', 'передавати на аутсорс', '/ˈaʊtsɔːrs/', 'Many firms outsource their IT support.', '💼 Work & business'),
  ('b2', 27, 'overwhelmed', 'перевантажений, приголомшений', '/ˌoʊvərˈwelmd/', 'I felt overwhelmed by all the work.', '🧠 Feelings & traits'),
  ('b2', 28, 'resilient', 'стійкий', '/rɪˈzɪliənt/', 'Children are often very resilient.', '🧠 Feelings & traits'),
  ('b2', 29, 'reluctant', 'неохочий', '/rɪˈlʌktənt/', 'He was reluctant to ask for help.', '🧠 Feelings & traits'),
  ('b2', 30, 'thrilled', 'у захваті', '/θrɪld/', 'We were thrilled with the results.', '🧠 Feelings & traits'),
  ('b2', 31, 'humble', 'скромний', '/ˈhʌmbəl/', 'Despite his fame, he stayed humble.', '🧠 Feelings & traits'),
  ('b2', 32, 'frustrated', 'роздратований', '/ˈfrʌstreɪtɪd/', 'I get frustrated when my laptop freezes.', '🧠 Feelings & traits'),
  ('b2', 33, 'anxious', 'тривожний', '/ˈæŋkʃəs/', 'I feel anxious before long flights.', '🧠 Feelings & traits'),
  ('b2', 34, 'come up with', 'вигадати, придумати', '/kʌm ʌp wɪð/', 'We need to come up with a plan.', '🧩 Phrasal verbs'),
  ('b2', 35, 'carry out', 'проводити, виконувати', '/ˈkæri aʊt/', 'The team will carry out the research.', '🧩 Phrasal verbs'),
  ('b2', 36, 'put up with', 'терпіти, миритися', '/pʊt ʌp wɪð/', 'I can''t put up with this noise.', '🧩 Phrasal verbs'),
  ('b2', 37, 'break down', 'ламатися', '/breɪk daʊn/', 'Our old car might break down on the way.', '🧩 Phrasal verbs'),
  ('b2', 38, 'set up', 'засновувати, налаштовувати', '/set ʌp/', 'They want to set up a small business.', '🧩 Phrasal verbs'),
  ('b2', 39, 'get over', 'оговтатися, пережити', '/ɡet ˈoʊvər/', 'It took me weeks to get over the flu.', '🧩 Phrasal verbs'),
  ('b2', 40, 'point out', 'вказувати на', '/pɔɪnt aʊt/', 'She was right to point out the mistake.', '🧩 Phrasal verbs');
