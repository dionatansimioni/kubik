// Carregador do script. NÃO coloque lógica aqui.
//
// O KWin compila cada arquivo QML uma vez e o guarda em memória, indexado
// pela URL, até reiniciar. Ao atualizar o pacote com a sessão aberta, o KWin
// recarregaria o código ANTIGO. Este arquivo nunca muda (o cache dele é
// inofensivo) e carrega o código real por uma URL única a cada carga, o que
// força a leitura do arquivo atual em disco.
import QtQuick

Loader {
    source: Qt.resolvedUrl("Kubik.qml") + "?load=" + Date.now()
    onStatusChanged: {
        if (status === Loader.Error)
            console.warn("[kubik] falha ao carregar Kubik.qml");
    }
}
