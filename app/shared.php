<?php
// shared.php — зручна сторінка для перегляду поширених нотаток
// Відкривається при переході за посиланням: shared.php?id=<dbId>
// Відображає нотатку в тому ж інтерфейсі Notecraft (тільки для читання).
// Фактичне отримання даних виконується на клієнті через JSON API view.php.

$id = isset($_GET['id']) ? htmlspecialchars(trim($_GET['id']), ENT_QUOTES, 'UTF-8') : '';
if ($id === '') {
    header('Location: index.html');
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Shared Note — Notecraft</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- перенаправлення на index.html з передачею ID нотатки як параметра запиту -->
<script>
  // Передаємо dbId у головний застосунок; він викличе view.php, щоб отримати нотатку
  var id = <?php echo json_encode($id); ?>;
  window.location.replace('index.html?share=' + encodeURIComponent(id));
</script>
<noscript>
  <meta http-equiv="refresh" content="0;url=index.html?share=<?php echo urlencode($id); ?>">
</noscript>
</head>
<body></body>
</html>
