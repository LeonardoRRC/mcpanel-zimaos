<?php
/** <option>s for every mcjars server type, grouped. @var ?string $selectedType */
$byGroup = [];
foreach (Software::types() as $t) {
    $byGroup[$t['group']][] = $t;
}
foreach (Software::GROUPS + array_fill_keys(array_keys($byGroup), null) as $group => $groupLabel):
    if (empty($byGroup[$group])) continue; ?>
    <optgroup label="<?= e($groupLabel ?? ucfirst($group)) ?>">
        <?php foreach ($byGroup[$group] as $t): ?>
            <option value="<?= e($t['id']) ?>" data-desc="<?= e($t['description']) ?>" <?= strtoupper((string)($selectedType ?? '')) === $t['id'] ? 'selected' : '' ?>><?= e($t['name']) ?><?= $t['deprecated'] ? ' (obsoleto)' : '' ?></option>
        <?php endforeach; ?>
    </optgroup>
<?php endforeach;
