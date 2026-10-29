<?php /** @var Server $server */ $c = $server->cfg; ?>
<div class="page-head">
    <h1>Startup</h1>
    <div class="actions"><button class="btn btn-primary" id="save-startup"><i class="fa-solid fa-floppy-disk"></i> Guardar cambios</button></div>
</div>

<form id="startup-form" class="grid" style="gap:18px" onsubmit="return false">
    <div class="card">
        <div class="card-head"><i class="fa-solid fa-terminal"></i> Comando de inicio
            <div class="right"><button type="button" class="btn btn-sm" id="reset-startup" style="background:rgba(0,0,0,.2);border-color:transparent">Restablecer</button></div>
        </div>
        <div class="card-body">
            <textarea class="input dark" name="startup" rows="2" spellcheck="false"><?= e($c['startup']) ?></textarea>
            <div class="var-list" title="Clic para insertar">
                <?php foreach (['{{JAVA}}' => 'Ruta de Java', '{{RAM_MIN}}' => 'RAM mínima (MB)', '{{RAM_MAX}}' => 'RAM máxima (MB)', '{{FLAGS}}' => 'Flags JVM', '{{JAR}}' => 'Archivo jar', '{{PORT}}' => 'Puerto'] as $v => $desc): ?>
                    <code data-var="<?= $v ?>" title="<?= e($desc) ?>"><?= $v ?></code>
                <?php endforeach; ?>
            </div>
            <div class="hint" style="margin-top:14px">Vista previa del comando final:</div>
            <div class="preview" id="preview"><?= e($server->startupPreview()) ?></div>
        </div>
    </div>

    <div class="grid grid-2">
        <div class="card">
            <div class="card-head"><i class="fa-brands fa-java"></i> Versión de Java</div>
            <div class="card-body">
                <div class="java-list" id="java-list"><span class="muted">Cargando...</span></div>
                <input type="hidden" name="java" value="<?= (int)$c['java'] ?>">
                <p class="hint">Eclipse Temurin JRE. Minecraft 1.17–1.20.4 usa Java 17, 1.20.5–1.21 usa Java 21 y 26.x usa Java 25. Las versiones antiguas (≤1.16) usan Java 8 u 11.</p>
            </div>
        </div>

        <div class="card">
            <div class="card-head"><i class="fa-solid fa-memory"></i> Memoria y JVM</div>
            <div class="card-body">
                <div class="row">
                    <label class="field"><span>RAM mínima (MB)</span><input class="input dark" type="number" name="ram_min" min="128" step="128" value="<?= (int)$c['ram_min'] ?>"></label>
                    <label class="field"><span>RAM máxima (MB)</span><input class="input dark" type="number" name="ram_max" min="256" step="256" value="<?= (int)$c['ram_max'] ?>"></label>
                </div>
                <div class="row">
                    <label class="field"><span>Flags</span>
                        <select class="input dark" name="flags_preset">
                            <option value="aikar" <?= $c['flags_preset'] === 'aikar' ? 'selected' : '' ?>>Aikar's flags (recomendado)</option>
                            <option value="none" <?= $c['flags_preset'] === 'none' ? 'selected' : '' ?>>Ninguno</option>
                        </select>
                    </label>
                    <label class="field"><span>Archivo jar</span><input class="input dark" name="jar" value="<?= e($c['jar']) ?>"></label>
                </div>
                <label class="field" style="margin:0"><span>Flags adicionales</span>
                    <input class="input dark mono" name="custom_flags" value="<?= e($c['custom_flags']) ?>" placeholder="-Dfile.encoding=UTF-8"></label>
            </div>
        </div>
    </div>

    <div class="grid grid-2">
        <div class="card">
            <div class="card-head"><i class="fa-solid fa-cube"></i> Software del servidor</div>
            <div class="card-body">
                <p class="muted" style="margin-top:0">Instalado: <b style="color:var(--white)"><?= e($c['software']['build'] ?? (Software::label($c['software']['type'] ?? '') . ' ' . ($c['software']['version'] ?? '—'))) ?></b></p>
                <div class="row">
                    <label class="field"><span>Tipo</span>
                        <select class="input dark" id="sw-type">
                            <?php $selectedType = $c['software']['type']; require dirname(__DIR__) . '/software-options.php'; ?>
                        </select>
                    </label>
                    <label class="field"><span>Versión</span><select class="input dark" id="sw-version"></select></label>
                </div>
                <div class="row">
                    <label class="field"><span>Build</span><select class="input dark" id="sw-build"></select></label>
                    <label class="switch" style="align-self:end;margin-bottom:22px"><input type="checkbox" id="sw-snapshots"><span class="track"></span><span>Snapshots</span></label>
                </div>
                <p class="hint" id="sw-desc" style="margin-top:-6px"></p>
                <button type="button" class="btn btn-primary" id="sw-install"><i class="fa-solid fa-download"></i> Instalar / cambiar versión</button>
                <p class="hint">Versiones de <a href="https://mcjars.app" target="_blank" rel="noopener">MCJars</a>. Reemplaza <code class="mono"><?= e($c['jar']) ?></code> y selecciona la versión de Java adecuada. Tus mundos y plugins no se tocan; haz una copia antes de bajar de versión.</p>
            </div>
        </div>

        <div class="card">
            <div class="card-head"><i class="fa-solid fa-sliders"></i> Opciones</div>
            <div class="card-body" style="display:flex;flex-direction:column;gap:16px">
                <label class="switch"><input type="checkbox" name="eula" <?= $c['eula'] ? 'checked' : '' ?>><span class="track"></span>
                    <span>Acepto el <a href="https://www.minecraft.net/eula" target="_blank" rel="noopener">EULA de Minecraft</a></span></label>
                <label class="switch"><input type="checkbox" name="auto_restart" <?= $c['auto_restart'] ? 'checked' : '' ?>><span class="track"></span>
                    <span>Reiniciar automáticamente si el servidor se cae</span></label>
                <label class="switch"><input type="checkbox" name="autostart" <?= $c['autostart'] ? 'checked' : '' ?>><span class="track"></span>
                    <span>Iniciar al encender ZimaOS / reiniciar el contenedor</span></label>
            </div>
        </div>
    </div>
</form>
