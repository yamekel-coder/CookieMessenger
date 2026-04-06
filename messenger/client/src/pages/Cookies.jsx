export default function Cookies() {
  return (
    <div className="static-page">
      <div className="static-container">
        <a href="/profile" className="static-back">← Назад</a>
        <h1 className="static-title">Политика Cookies</h1>
        <p className="static-date">Последнее обновление: апрель 2026</p>

        <div className="static-content">
          <h2>Что такое cookies?</h2>
          <p>Cookies — это небольшие текстовые файлы, которые сохраняются в вашем браузере при посещении сайта. Они помогают нам обеспечивать работу сервиса и улучшать ваш опыт.</p>

          <h2>Какие cookies мы используем</h2>

          <div className="cookies-table">
            <div className="cookies-row cookies-header">
              <span>Название</span>
              <span>Тип</span>
              <span>Срок</span>
              <span>Назначение</span>
            </div>
            <div className="cookies-row">
              <span><code>auth_token</code></span>
              <span>Необходимые</span>
              <span>7 дней</span>
              <span>Авторизация пользователя</span>
            </div>
            <div className="cookies-row">
              <span><code>theme</code></span>
              <span>Функциональные</span>
              <span>Постоянно</span>
              <span>Сохранение выбранной темы оформления</span>
            </div>
            <div className="cookies-row">
              <span><code>token</code></span>
              <span>Необходимые</span>
              <span>7 дней</span>
              <span>JWT токен для API запросов</span>
            </div>
          </div>

          <h2>Необходимые cookies</h2>
          <p>Эти cookies обязательны для работы сайта. Без них невозможна авторизация и использование основных функций. Они не могут быть отключены.</p>

          <h2>Функциональные cookies</h2>
          <p>Эти cookies позволяют сайту запоминать ваши предпочтения (например, тему оформления). Они не собирают личные данные.</p>

          <h2>Аналитические cookies</h2>
          <p>Мы не используем аналитические или рекламные cookies. Ваши данные не передаются третьим лицам.</p>

          <h2>Управление cookies</h2>
          <p>Вы можете удалить cookies в настройках вашего браузера. Обратите внимание, что удаление необходимых cookies приведёт к выходу из аккаунта.</p>

          <h2>Контакты</h2>
          <p>По вопросам использования cookies: <a href="mailto:support@rulinux.su">support@rulinux.su</a></p>
        </div>
      </div>
    </div>
  );
}
