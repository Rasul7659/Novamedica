<?php
// Сборка страницы лендинга из содержимого (порт server/render.js).
declare(strict_types=1);

function price_txt($p): string
{
    return $p ? 'от ' . preg_replace('/\B(?=(\d{3})+(?!\d))/', "\u{00A0}", (string) $p) . ' ₽' : 'от [000] ₽';
}

const ARROW = '<span class="arrow-circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>';

function crop_style(?array $m, string $extra = ''): string
{
    if (!$m || empty($m['crop'])) return $extra !== '' ? ' style="' . e($extra) . '"' : '';
    $c = $m['crop'];
    $s = (!empty($c['pos']) ? 'object-position:' . $c['pos'] . ';' : '')
        . 'transform:scale(' . (float) ($c['scale'] ?? 1) . ');transform-origin:' . ($c['origin'] ?? '50% 50%') . ';' . $extra;
    return ' style="' . e($s) . '"';
}

function media_by_slot(array $c, string $slot): ?array
{
    foreach ($c['media'] as $m) if ($m['id'] === ($c['slots'][$slot] ?? null)) return $m;
    return null;
}

function img_tag(?array $m, string $cls, string $alt, string $loading = 'lazy'): string
{
    if (!$m) return '';
    return '<img' . ($cls ? ' class="' . $cls . '"' : '') . ' src="' . e($m['url']) . '" alt="' . e($alt ?: ($m['alt'] ?: $m['name'])) . '" loading="' . $loading . '"' . crop_style($m) . '>';
}

function render_landing(array $c, bool $preview = false): string
{
    $hero = media_by_slot($c, 'hero');
    $about = media_by_slot($c, 'about');
    $iMain = media_by_slot($c, 'interiorMain');
    $iSign = media_by_slot($c, 'interiorSign');
    $iWait = media_by_slot($c, 'interiorWait');
    $k = $c['contacts'];
    $tel = tel_href($k['phone']);
    $wa = safe_link($k['whatsapp']);
    $tg = safe_link($k['telegram']);
    $services = array_values(array_filter($c['services'], fn($s) => $s['visible']));
    $doctors = array_values(array_filter($c['doctors'], fn($d) => $d['visible']));
    $specNames = [];
    foreach ($c['specialties'] as $sp) $specNames[$sp['id']] = $sp['name'];
    $specsPresent = array_values(array_filter(array_keys($specNames), function ($key) use ($doctors) {
        foreach ($doctors as $d) if ($d['spec'] === $key) return true;
        return false;
    }));
    $showNote = false;
    foreach ([$iMain, $iSign, $iWait] as $m) if ($m && !empty($m['placeholder'])) $showNote = true;
    $topics = array_merge(array_map(fn($s) => $s['title'], $services), ['Нужна помощь с выбором']);
    $stepText = ['Выбираете время онлайн или пишете в мессенджер.', 'Врач осматривает кожу и назначает необходимые исследования.', 'Вы получаете план с этапами, сроками и ценой.', 'Проходите курс и приходите на контрольные визиты.'];
    $steps = [$c['visit']['s1'], $c['visit']['s2'], $c['visit']['s3'], $c['visit']['s4']];
    $req = array_values(array_filter([
        $k['org'],
        implode(' · ', array_filter([$k['inn'] !== '' ? 'ИНН ' . $k['inn'] : '', $k['ogrn'] !== '' ? 'ОГРН ' . $k['ogrn'] : ''])),
    ], fn($x) => $x !== ''));
    $mediaById = [];
    foreach ($c['media'] as $m) $mediaById[$m['id']] = $m;

    ob_start();
    ?><!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Novamedica — центр эстетической и превентивной медицины в Москве</title>
<meta name="description" content="<?= e(mb_substr($c['about']['text'], 0, 160)) ?>">
<meta name="theme-color" content="#FAF9F5">
<?php if ($preview): ?><meta name="robots" content="noindex">
<?php endif; ?>
<link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/css/style.css">
</head>
<body>
<?php if ($preview): ?><div class="preview-bar">Предпросмотр: так сайт будет выглядеть после публикации. Посетители его не видят.</div>
<?php endif; ?>
<header class="header">
<div class="header__inner">
<a href="#top" class="logo" aria-label="Novamedica — на главную"><img src="/assets/logo.svg" alt=""><span>NOVAMEDICA</span></a>
<nav class="nav" aria-label="Основная навигация">
<a href="#services">Услуги и цены</a><a href="#about">Клиника</a><a href="#doctors">Врачи</a><a href="#contacts">Контакты</a>
</nav>
<a href="#contacts" class="btn btn--dark header__cta">Записаться на приём</a>
<button type="button" class="burger" aria-label="Меню" aria-expanded="false" aria-controls="mobile-menu">
<svg class="i-open" viewBox="0 0 24 24" fill="none" stroke="#FAF9F5" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M5 9h14M5 15h14"/></svg>
<svg class="i-close" viewBox="0 0 24 24" fill="none" stroke="#FAF9F5" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
</button>
</div>
</header>

<div class="mobile-menu" id="mobile-menu">
<a href="#services">Услуги и цены</a><a href="#about">Клиника</a><a href="#doctors">Врачи</a><a href="#contacts">Контакты</a>
<a href="#contacts" class="btn btn--dark">Записаться на приём</a>
</div>

<main>
<section id="top" class="hero-wrap">
<div class="hero">
<?php if ($hero): ?><img class="hero__img" src="<?= e($hero['url']) ?>" alt="<?= e($hero['alt'] ?: 'Ресепшен центра Novamedica') ?>" fetchpriority="high"<?= crop_style($hero) ?>>
<?php endif; ?>
<div class="hero__shade"></div>
<div class="hero__body">
<h1><?= e($c['hero']['h1']) ?></h1>
<?php if ($k['license'] !== ''): ?><div class="license"><i></i>Лицензия № <?= e($k['license']) ?></div>
<?php endif; ?>
<a href="#about" class="btn btn--light"><?= e($c['hero']['btn']) ?></a>
</div>
<div class="hero__bar">
<span>Сначала диагностика, потом процедуры</span>
<a href="#services" class="hero__link">Услуги и цены <?= ARROW ?></a>
</div>
</div>
</section>

<section class="address-row" aria-label="Адрес и режим работы"><?php foreach ([$k['address'], $k['hours'], $k['phone']] as $t): if ($t !== ''): ?><span><?= e($t) ?></span><?php endif; endforeach; ?></section>

<section id="about" class="about">
<div class="about__text">
<span class="eyebrow">О клинике</span>
<h2 class="h2"><?= e($c['about']['heading']) ?></h2>
<p class="about__lead"><?= e($c['about']['text']) ?></p>
<a href="#visit" class="btn btn--dark">Как проходит приём</a>
</div>
<?php if ($about): ?><div class="about__photo"><?= img_tag($about, '', 'Стойка ресепшена и вывеска') ?></div>
<?php endif; ?>
</section>

<section id="services" class="container services">
<div class="section-head">
<h2 class="h2">Услуги и цены</h2>
<p>Цены ориентировочные. Полный прайс — в клинике и по запросу.</p>
</div>
<div class="services__grid">
<?php foreach ($services as $s): ?><a href="#contacts" class="service" data-topic="<?= e($s['title']) ?>">
<div class="service__head"><h3><?= e($s['title']) ?></h3><?php if ($s['desc'] !== ''): ?><p class="service__desc"><?= e($s['desc']) ?></p><?php endif; ?></div>
<span class="service__price"><?= e(price_txt($s['price'])) ?></span><?= ARROW ?></a>
<?php endforeach; ?>
<a href="#contacts" class="service service--accent" data-topic="Нужна помощь с выбором">
<div class="service__head"><h3>Программы ухода</h3><p class="service__desc">План на несколько месяцев с контрольными визитами</p></div>
<span class="service__price"><span>Записаться</span></span><?= ARROW ?></a>
</div>
<p class="services__note-mobile">Цены ориентировочные. Полный прайс — в клинике.</p>
</section>

<?php if ($doctors): ?><section id="doctors" class="container doctors">
<h2 class="h2">Врачи</h2>
<?php if (count($specsPresent) > 1): ?><div class="chips" role="group" aria-label="Фильтр по специальности">
<button type="button" class="chip is-active" data-filter="all">Все</button>
<?php foreach ($specsPresent as $key): ?><button type="button" class="chip" data-filter="<?= e($key) ?>"><?= e($specNames[$key]) ?></button>
<?php endforeach; ?></div>
<?php endif; ?>
<div class="doctors__grid">
<?php foreach ($doctors as $d): $pm = $mediaById[$d['photoId'] ?? ''] ?? null; ?><article class="doctor" data-role="<?= e($d['spec']) ?>"><div class="doctor__photo"><?php if ($pm): ?><img src="<?= e($pm['url']) ?>" alt="<?= e($pm['alt'] ?: $d['name']) ?>" loading="lazy"><?php endif; ?></div>
<div><div class="doctor__role"><?= e($specNames[$d['spec']] ?? '') ?></div><h3><?= e($d['name']) ?></h3><?php if ($d['exp'] !== ''): ?><div class="doctor__meta">Стаж <?= e($d['exp']) ?> лет</div><?php endif; ?><?php if ($d['bio'] !== ''): ?><div class="doctor__meta"><?= e($d['bio']) ?></div><?php endif; ?></div></article>
<?php endforeach; ?>
</div>
</section>
<?php endif; ?>

<section id="visit" class="visit-wrap">
<div class="visit">
<h2 class="h2"><?= e($c['visit']['heading']) ?></h2>
<ol class="steps">
<?php foreach ($steps as $i => $t): ?><li class="step"><span class="step__n">0<?= $i + 1 ?></span><h3><?= e($t) ?></h3><p><?= e($stepText[$i]) ?></p></li>
<?php endforeach; ?>
</ol>
</div>
</section>

<?php if ($iMain || $iSign || $iWait): ?><section id="interior" class="container interior">
<div class="section-head">
<h2 class="h2">Интерьер</h2>
<?php if ($showNote): ?><span class="interior__cap">1 — 3 · визуализация, заменить на фото клиники</span>
<?php endif; ?>
</div>
<div class="interior__grid">
<?php if ($iMain): ?><div class="shot shot--main"><?= img_tag($iMain, '', 'Ресепшен') ?></div>
<?php endif; ?>
<div class="interior__side">
<?php if ($iSign): ?><div class="shot"><?= img_tag($iSign, '', 'Вывеска с логотипом') ?></div>
<?php endif; ?>
<?php if ($iWait): ?><div class="shot"><?= img_tag($iWait, '', 'Зона ожидания') ?></div>
<?php endif; ?>
</div>
</div>
<?php if ($showNote): ?><span class="interior__cap interior__cap--mobile">1 — 3 · визуализация, заменить на фото клиники</span>
<?php endif; ?>
</section>
<?php endif; ?>

<section id="contacts" class="contacts-wrap">
<div class="contacts">
<div class="contacts__info">
<h2 class="h2"><?= e($c['form']['heading']) ?></h2>
<p class="contacts__lead"><?= e($c['form']['text']) ?></p>
<?php if ($wa || $tg): ?><div class="messengers">
<?php if ($wa): ?><a href="<?= e($wa) ?>" class="btn btn--dark" target="_blank" rel="noopener">WhatsApp</a>
<?php endif; ?>
<?php if ($tg): ?><a href="<?= e($tg) ?>" class="btn btn--light" target="_blank" rel="noopener">Telegram</a>
<?php endif; ?>
</div>
<?php endif; ?>
<div class="info-list">
<?php if ($k['address'] !== ''): ?><div><small>Адрес</small><?= e($k['address']) ?></div>
<?php endif; ?>
<?php if ($k['hours'] !== ''): ?><div><small>Режим работы</small><?= e($k['hours']) ?></div>
<?php endif; ?>
<?php if ($k['phone'] !== ''): ?><div><small>Телефон</small><?php if ($tel): ?><a href="tel:<?= e($tel) ?>"><?= e($k['phone']) ?></a><?php else: ?><?= e($k['phone']) ?><?php endif; ?></div>
<?php endif; ?>
</div>
</div>
<div class="form-card">
<form class="form" id="lead-form" novalidate>
<div class="field"><label for="f-name">Имя</label><input id="f-name" name="name" type="text" placeholder="Как к вам обращаться" autocomplete="name" maxlength="80" required><span class="field__error" id="e-name"></span></div>
<div class="field"><label for="f-phone">Телефон</label><input id="f-phone" name="phone" type="tel" placeholder="+7" autocomplete="tel" inputmode="tel" maxlength="30" required><span class="field__error" id="e-phone"></span></div>
<div class="field"><label for="f-topic">Направление</label>
<select id="f-topic" name="topic"><?php foreach ($topics as $t): ?><option><?= e($t) ?></option><?php endforeach; ?></select></div>
<input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<div class="consent-wrap"><div class="consent"><input id="f-consent" name="consent" type="checkbox" required><label for="f-consent">Согласен на обработку персональных данных и с <a href="#policy">политикой конфиденциальности</a></label></div><span class="field__error" id="e-consent"></span></div>
<button type="submit" class="btn btn--dark">Записаться на приём</button>
<p class="form__status" role="alert" id="form-error"></p>
</form>
<div class="form-done" id="form-done" role="status" hidden>
<span class="form-done__icon"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg></span>
<span class="form-done__title">Спасибо, <span id="done-name"></span>! Заявка принята.</span>
<span class="form-done__text">Администратор позвонит вам по номеру <span id="done-phone"></span> в рабочее время.</span>
<button type="button" class="btn btn--outline" id="form-again">Отправить ещё одну</button>
</div>
</div>
</div>
</section>
</main>

<footer id="policy" class="container footer">
<div class="footer__top">
<div class="logo"><img src="/assets/logo.svg" alt=""><div><span>NOVAMEDICA</span><small>Центр эстетической и превентивной медицины</small></div></div>
<div class="footer__col"><b>Навигация</b><a href="#services">Услуги и цены</a><a href="#about">Клиника</a><a href="#doctors">Врачи</a><a href="#contacts">Контакты</a></div>
<div class="footer__col"><b>Документы</b><a href="#policy">Лицензия на медицинскую деятельность</a><a href="#policy">Политика конфиденциальности</a><a href="#policy">Согласие на обработку данных</a></div>
<div class="footer__col"><b>Реквизиты</b><?php foreach ($req as $t): ?><span><?= e($t) ?></span><?php endforeach; ?></div>
</div>
<div class="footer__bottom"><span><?= e($c['footer']['note']) ?></span><span>© <?= date('Y') ?> <?= e($c['footer']['org']) ?></span></div>
</footer>

<script src="/js/main.js"></script>
</body>
</html>
<?php
    return (string) ob_get_clean();
}
