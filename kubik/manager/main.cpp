// Gerenciador do Kubik: a janela do AppImage e da entrada "Kubik" do menu.
//
// Vai dentro do AppImage junto com o próprio Qt (6.8 LTS, do Debian 13), para
// não depender do Qt nem dos módulos do Plasma da máquina: só QtQuick e
// QtQuick.Controls (estilo Fusion), com as cores, a fonte e os ícones lidos do
// kdeglobals do usuário. O QML (Main.qml) e a lógica gerada do TypeScript
// (logic.js, src/manager/logic.ts) vão dentro do executável.
//
// Uso: kubik-manager [--bundle <diretório do pacote>]
// Sai com 3 se a janela não abrir (o AppImage cai então no menu do kdialog).
#include <QDir>
#include <QFile>
#include <QFont>
#include <QGuiApplication>
#include <QIcon>
#include <QJsonDocument>
#include <QJsonObject>
#include <QPalette>
#include <QProcess>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QSettings>
#include <QVariantMap>

#include <cstdlib>

namespace {

// Variáveis do ambiente do Plasma que apontam para o Qt do sistema: um plugin
// de outra versão do Qt não carrega aqui (e pode derrubar o app). Saem do
// nosso processo, mas os comandos (install.sh, plasmawindowed…) recebem o
// ambiente original.
const char *const kSystemQtVars[] = {
    "QT_PLUGIN_PATH", "QML_IMPORT_PATH", "QML2_IMPORT_PATH", "QT_QPA_PLATFORMTHEME",
    "QT_STYLE_OVERRIDE", "QT_QUICK_CONTROLS_STYLE", "QT_QUICK_CONTROLS_MOBILE",
};

// Roda comandos de shell para o QML: run() devolve um id, finished() traz o
// resultado. Cada comando ganha o ambiente original da sessão.
class Shell : public QObject {
    Q_OBJECT
public:
    explicit Shell(const QProcessEnvironment &env, QObject *parent = nullptr) : QObject(parent), m_env(env) {}

    Q_INVOKABLE int run(const QString &command) {
        const int id = ++m_next;
        auto *p = new QProcess(this);
        p->setProcessEnvironment(m_env);
        connect(p, &QProcess::finished, this, [this, p, id](int code, QProcess::ExitStatus status) {
            emit finished(id, status == QProcess::NormalExit ? code : -1,
                          QString::fromUtf8(p->readAllStandardOutput()), QString::fromUtf8(p->readAllStandardError()));
            p->deleteLater();
        });
        connect(p, &QProcess::errorOccurred, this, [this, p, id](QProcess::ProcessError e) {
            if (e != QProcess::FailedToStart)
                return;
            emit finished(id, 127, QString(), p->errorString());
            p->deleteLater();
        });
        p->start(QStringLiteral("/bin/sh"), {QStringLiteral("-c"), command});
        return id;
    }

signals:
    void finished(int id, int code, const QString &stdoutText, const QString &stderrText);

private:
    QProcessEnvironment m_env;
    int m_next = 0;
};

// ---- tema do KDE (kdeglobals) --------------------------------------------------

QString kdeglobalsPath() {
    const QByteArray xdg = qgetenv("XDG_CONFIG_HOME");
    const QString dir = xdg.isEmpty() ? QDir::homePath() + QStringLiteral("/.config") : QString::fromLocal8Bit(xdg);
    return dir + QStringLiteral("/kdeglobals");
}

// "r,g,b" (o QSettings lê como lista) → cor; inválida se faltar.
QColor kdeColor(QSettings &s, const QString &group, const QString &key) {
    const QVariant v = s.value(group + QLatin1Char('/') + key);
    const QStringList parts = v.typeId() == QMetaType::QStringList ? v.toStringList() : v.toString().split(QLatin1Char(','));
    if (parts.size() < 3)
        return {};
    return QColor(parts[0].trimmed().toInt(), parts[1].trimmed().toInt(), parts[2].trimmed().toInt());
}

// A fonte do kdeglobals. Um Plasma com Qt mais novo grava campos a mais
// ("Noto Sans,12,-1,5,400,0,0,0,0,0,0,0,0,0,0,1,,0,0": 19) que o QFont do Qt
// 6.8 recusa; então os 17 que ele conhece e, em último caso, família e tamanho.
QFont kdeFont(const QString &spec) {
    QFont font;
    const QStringList parts = spec.split(QLatin1Char(','));
    if (parts.size() <= 17 && font.fromString(spec))
        return font;
    if (parts.size() > 17 && font.fromString(parts.mid(0, 17).join(QLatin1Char(','))))
        return font;
    font = QFont(parts.value(0).trimmed());
    bool ok = false;
    const double size = parts.value(1).toDouble(&ok);
    if (ok && size > 0)
        font.setPointSizeF(size);
    return font;
}

// Cores, fonte e ícones do usuário; devolve as cores de aviso para o QML.
QVariantMap applyKdeTheme() {
    QVariantMap theme{
        {QStringLiteral("positive"), QColor(0x27, 0xae, 0x60)},
        {QStringLiteral("neutral"), QColor(0xf6, 0x74, 0x00)},
        {QStringLiteral("negative"), QColor(0xda, 0x44, 0x53)},
        {QStringLiteral("fromKde"), false},
    };
    QIcon::setFallbackThemeName(QStringLiteral("hicolor"));
    QSettings s(kdeglobalsPath(), QSettings::IniFormat);
    QIcon::setThemeName(s.value(QStringLiteral("Icons/Theme"), QStringLiteral("breeze")).toString());

    // O QSettings trata o [General] do INI como a raiz: a chave é "font".
    const QVariant fontValue = s.value(QStringLiteral("font"));
    const QString fontSpec = fontValue.typeId() == QMetaType::QStringList ? fontValue.toStringList().join(QLatin1Char(','))
                                                                           : fontValue.toString();
    if (!fontSpec.isEmpty())
        QGuiApplication::setFont(kdeFont(fontSpec));

    const QColor window = kdeColor(s, QStringLiteral("Colors:Window"), QStringLiteral("BackgroundNormal"));
    if (!window.isValid())
        return theme;  // sem kdeglobals: o Fusion padrão
    auto pick = [&](const char *group, const char *key, const QColor &fallback) {
        const QColor c = kdeColor(s, QString::fromLatin1(group), QString::fromLatin1(key));
        return c.isValid() ? c : fallback;
    };
    const QColor windowText = pick("Colors:Window", "ForegroundNormal", Qt::black);
    const QColor base = pick("Colors:View", "BackgroundNormal", window);
    const QColor text = pick("Colors:View", "ForegroundNormal", windowText);
    const QColor button = pick("Colors:Button", "BackgroundNormal", window);
    const QColor buttonText = pick("Colors:Button", "ForegroundNormal", windowText);
    const QColor highlight = pick("Colors:Selection", "BackgroundNormal", QColor(0x3d, 0xae, 0xe9));
    const QColor highlightText = pick("Colors:Selection", "ForegroundNormal", Qt::white);
    const QColor inactive = pick("Colors:View", "ForegroundInactive", text);

    QPalette p;
    p.setColor(QPalette::Window, window);
    p.setColor(QPalette::WindowText, windowText);
    p.setColor(QPalette::Base, base);
    p.setColor(QPalette::AlternateBase, pick("Colors:View", "BackgroundAlternate", base));
    p.setColor(QPalette::Text, text);
    p.setColor(QPalette::Button, button);
    p.setColor(QPalette::ButtonText, buttonText);
    p.setColor(QPalette::Highlight, highlight);
    p.setColor(QPalette::HighlightedText, highlightText);
    p.setColor(QPalette::PlaceholderText, inactive);
    p.setColor(QPalette::Link, pick("Colors:View", "ForegroundLink", highlight));
    p.setColor(QPalette::ToolTipBase, pick("Colors:Tooltip", "BackgroundNormal", base));
    p.setColor(QPalette::ToolTipText, pick("Colors:Tooltip", "ForegroundNormal", text));
    p.setColor(QPalette::Light, button.lighter(150));
    p.setColor(QPalette::Midlight, button.lighter(125));
    p.setColor(QPalette::Mid, button.darker(130));
    p.setColor(QPalette::Dark, button.darker(160));
    p.setColor(QPalette::Shadow, button.darker(300));
    for (auto role : {QPalette::WindowText, QPalette::Text, QPalette::ButtonText})
        p.setColor(QPalette::Disabled, role, inactive);
    QGuiApplication::setPalette(p);

    theme[QStringLiteral("positive")] = pick("Colors:Window", "ForegroundPositive", theme[QStringLiteral("positive")].value<QColor>());
    theme[QStringLiteral("neutral")] = pick("Colors:Window", "ForegroundNeutral", theme[QStringLiteral("neutral")].value<QColor>());
    theme[QStringLiteral("negative")] = pick("Colors:Window", "ForegroundNegative", theme[QStringLiteral("negative")].value<QColor>());
    theme[QStringLiteral("fromKde")] = true;
    return theme;
}

QString bundledVersion(const QString &bundleDir) {
    if (bundleDir.isEmpty())
        return {};
    QFile f(bundleDir + QStringLiteral("/packages/kubik/metadata.json"));
    if (!f.open(QIODevice::ReadOnly))
        return {};
    return QJsonDocument::fromJson(f.readAll()).object().value(QStringLiteral("KPlugin")).toObject().value(QStringLiteral("Version")).toString();
}

}  // namespace

int main(int argc, char *argv[]) {
    // Os comandos não herdam as variáveis do AppImage (um AppImage que eles
    // rodem, como o de uma versão nova, acharia que é este); o install.sh
    // recebe o caminho deste em KUBIK_APPIMAGE (o AppRun já o exporta).
    QProcessEnvironment sessionEnv = QProcessEnvironment::systemEnvironment();
    for (const char *var : {"APPIMAGE", "APPDIR", "ARGV0", "OWD"})
        sessionEnv.remove(QString::fromLatin1(var));
    for (const char *var : kSystemQtVars)
        unsetenv(var);

    // O app_id do Wayland: o mesmo nome da entrada do menu (ícone e nome do
    // Kubik na barra de tarefas).
    QGuiApplication::setDesktopFileName(QStringLiteral("io.github.dionatansimioni.kubik"));
    QGuiApplication::setApplicationName(QStringLiteral("kubik-manager"));
    QGuiApplication::setApplicationDisplayName(QStringLiteral("Kubik"));
    QGuiApplication::setOrganizationDomain(QStringLiteral("dionatansimioni.github.io"));
    QGuiApplication app(argc, argv);
    QGuiApplication::setWindowIcon(QIcon(QStringLiteral(":/kubik.svg")));

    QString bundleDir;
    const QStringList args = app.arguments();
    for (int i = 1; i < args.size(); ++i) {
        if (args[i] == QLatin1String("--bundle") && i + 1 < args.size())
            bundleDir = args[++i];
        else if (args[i].startsWith(QLatin1String("--bundle=")))
            bundleDir = args[i].mid(9);
    }

    QQuickStyle::setStyle(QStringLiteral("Fusion"));
    const QVariantMap theme = applyKdeTheme();

    Shell shell(sessionEnv);
    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty(QStringLiteral("shell"), &shell);
    engine.rootContext()->setContextProperty(QStringLiteral("bundleDir"), bundleDir);
    engine.rootContext()->setContextProperty(QStringLiteral("bundledVersion"), bundledVersion(bundleDir));
    engine.rootContext()->setContextProperty(QStringLiteral("kdeTheme"), theme);
    engine.rootContext()->setContextProperty(QStringLiteral("qtVersion"), QString::fromLatin1(qVersion()));
    engine.load(QUrl(QStringLiteral("qrc:/Main.qml")));
    if (engine.rootObjects().isEmpty())
        return 3;
    return app.exec();
}

#include "main.moc"
