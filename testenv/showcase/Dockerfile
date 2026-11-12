# Vitrine: o testenv do Arch com apps reais e os papéis de parede do Plasma,
# para os screenshots e GIFs do README e do site (scripts/showcase.sh).
FROM kubik-testenv
USER root
RUN pacman -Syu --noconfirm --needed \
        konsole dolphin kate plasma-workspace-wallpapers noto-fonts \
        plasma-integration fastfetch git \
    && pacman -Scc --noconfirm
USER tester
# O Breeze Dark desde o começo (exportado de um plasma-apply-colorscheme): o
# KWin já inicia escuro, inclusive as barras de abas do Kubik.
COPY --chown=tester kdeglobals /home/tester/.config/kdeglobals
ENV QT_QPA_PLATFORMTHEME=kde
